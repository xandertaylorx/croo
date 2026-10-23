import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { claudeArgs, ClaudeStream, describeTool } from '../src/subscriptions/claude.js'
import { codexArgs, CodexStream, unwrapShell } from '../src/subscriptions/codex.js'
import { findModel, modelEfforts, subscriptionModels } from '../src/subscriptions/catalog.js'
import { catchUp } from '../src/subscriptions/index.js'
import type { TurnSink } from '../src/subscriptions/events.js'

function recorder() {
  const ev: string[] = []
  const sink: TurnSink = {
    thinking: () => ev.push('thinking'),
    reasoning: () => ev.push('reasoning'),
    text: (d) => ev.push(`text:${d}`),
    textEnd: () => ev.push('textEnd'),
    toolRunning: (n, s) => ev.push(`run:${n}:${s}`),
    toolDone: (n, s, ok) => ev.push(`done:${n}:${s}:${ok}`),
    usage: (u) => ev.push(`usage:${u.output > 0}`),
    context: (n) => ev.push(`ctx:${n > 0}`),
    note: (t) => ev.push(`note:${t}`),
  }
  return { ev, sink }
}

describe('Claude Code stream', () => {
  const lines = fs.readFileSync(path.join(__dirname, 'fixtures/claude-stream.jsonl'), 'utf8').split('\n').filter(Boolean)

  it('turns a recorded run into tool cards, text and usage', () => {
    const { ev, sink } = recorder()
    const r = new ClaudeStream(sink, '/private/tmp/croo-probe')
    for (const l of lines) r.feed(l)
    const msgs = r.finish()
    expect(r.sessionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(r.error).toBeUndefined()
    expect(ev.filter((e) => e.startsWith('run:'))).toEqual(['run:read_file:a.txt', expect.stringMatching(/^run:bash:echo/)])
    expect(ev.filter((e) => e.startsWith('done:')).every((e) => e.endsWith(':true'))).toBe(true)
    expect(ev).toContain('usage:true')
    // Each tool call is answered, and the chat keeps the order: calls, results, final words.
    const calls = msgs.flatMap((m) => (m.role === 'assistant' ? (m.toolCalls ?? []) : []))
    const results = msgs.filter((m) => m.role === 'tool')
    expect(calls.length).toBe(results.length)
    expect(calls.length).toBeGreaterThanOrEqual(2)
    expect(msgs[msgs.length - 1].role).toBe('assistant')
  })

  it('does not repeat text that was already streamed', () => {
    const { ev, sink } = recorder()
    const r = new ClaudeStream(sink, '/x')
    for (const l of lines) r.feed(l)
    const streamed = ev.filter((e) => e.startsWith('text:')).map((e) => e.slice(5)).join('')
    const finals = r.finish().flatMap((m) => (m.role === 'assistant' ? [m.content] : []))
    expect(finals.join('')).toBe(streamed)
  })

  it('reports an error result, and says plainly when signed out', () => {
    const { sink } = recorder()
    const r = new ClaudeStream(sink, '/x')
    r.feed(JSON.stringify({ type: 'result', is_error: true, result: 'Invalid API key · Please run /login' }))
    expect(r.error).toMatch(/claude auth login/)
    const q = new ClaudeStream(sink, '/x')
    q.feed(JSON.stringify({ type: 'result', is_error: true, result: 'Overloaded' }))
    expect(q.error).toBe('Overloaded')
  })

  it('tells the user about blocked tools instead of failing quietly', () => {
    const { ev, sink } = recorder()
    const r = new ClaudeStream(sink, '/w')
    r.feed(JSON.stringify({ type: 'result', subtype: 'success', permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'rm -rf dist' } }] }))
    expect(ev.find((e) => e.startsWith('note:'))).toMatch(/Bash.*rm -rf dist.*Bypass/)
  })

  it('ignores a subagent’s inner work', () => {
    const { ev, sink } = recorder()
    const r = new ClaudeStream(sink, '/w')
    r.feed(JSON.stringify({ type: 'assistant', parent_tool_use_id: 't1', message: { id: 'm', content: [{ type: 'tool_use', id: 'x', name: 'Read', input: { file_path: '/w/a' } }] } }))
    expect(ev).toEqual([])
  })

  it('maps tools to the app’s names with short summaries', () => {
    expect(describeTool('Edit', { file_path: '/w/src/a.ts' }, '/w')).toEqual({ name: 'edit_file', summary: 'src/a.ts' })
    expect(describeTool('Bash', { command: 'npm test\nmore' }, '/w')).toEqual({ name: 'bash', summary: 'npm test' })
    expect(describeTool('mcp__github__create_issue', { title: 't' }, '/w').name).toBe('mcp__github__create_issue')
  })

  it('shows Claude’s task list in the pinned list format', () => {
    const { ev, sink } = recorder()
    const r = new ClaudeStream(sink, '/w')
    const todos = [{ content: 'one', status: 'completed' }, { content: 'two', status: 'in_progress' }, { content: 'three', status: 'pending' }]
    r.feed(JSON.stringify({ type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', id: 'x', name: 'TodoWrite', input: { todos } }] } }))
    r.feed(JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'Todos have been modified' }] } }))
    expect(ev).toContain('done:todo_write:tasks:true')
    expect(r.finish().find((m) => m.role === 'tool')).toMatchObject({ content: '[x] one\n[~] two\n[ ] three' })
  })

  it('maps permission modes and only sends efforts a model takes', () => {
    const a = claudeArgs({ model: 'sonnet', effort: 'xhigh', mode: 'auto' })
    expect(a).toContain('acceptEdits')
    expect(a[a.indexOf('--model') + 1]).toBe('claude-sonnet-5-5')
    expect(a[a.indexOf('--effort') + 1]).toBe('xhigh')
    expect(claudeArgs({ model: 'claude-haiku-4-5', effort: 'high', mode: 'plan' })).not.toContain('--effort')
    expect(claudeArgs({ model: 'x', mode: 'bypass', resume: 'abc' }).join(' ')).toMatch(/bypassPermissions[\s\S]*--resume abc/)
    expect(claudeArgs({ model: 'x', mode: 'auto', oneShot: true })).toContain('--no-session-persistence')
  })
})

describe('Codex stream', () => {
  const run = (events: object[]) => {
    const { ev, sink } = recorder()
    const r = new CodexStream(sink, '/w')
    for (const e of events) r.feed(JSON.stringify(e))
    return { ev, r }
  }

  it('shows messages between the work as updates, and each command as a card', () => {
    const { ev, r } = run([
      { type: 'thread.started', thread_id: 'th1' },
      { type: 'turn.started' },
      { type: 'item.completed', item: { id: 'i0', type: 'agent_message', text: 'Looking at the config first.' } },
      { type: 'item.started', item: { id: 'i1', type: 'command_execution', command: "bash -lc 'ls src'", status: 'in_progress' } },
      { type: 'item.completed', item: { id: 'i1', type: 'command_execution', command: "bash -lc 'ls src'", aggregated_output: 'a.ts', exit_code: 0, status: 'completed' } },
      { type: 'item.completed', item: { id: 'i2', type: 'file_change', status: 'completed', changes: [{ path: '/w/src/a.ts', kind: 'update' }, { path: '/w/b.ts', kind: 'add' }] } },
      { type: 'item.completed', item: { id: 'i3', type: 'agent_message', text: 'Done.' } },
      { type: 'turn.completed', usage: { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 50 } },
    ])
    expect(r.sessionId).toBe('th1')
    expect(ev).toEqual([
      'thinking',
      'text:Looking at the config first.',
      'textEnd',
      'thinking',
      'run:bash:ls src',
      'done:bash:ls src:true',
      'run:edit_file:src/a.ts',
      'done:edit_file:src/a.ts:true',
      'run:write_file:b.ts',
      'done:write_file:b.ts:true',
      'text:Done.',
      'textEnd',
      'thinking',
      'usage:true',
      'ctx:true',
    ])
    const msgs = r.finish()
    expect(msgs.map((m) => (m.role === 'assistant' ? `a:${m.content}:${m.toolCalls?.length ?? 0}` : m.role === 'tool' ? `t:${m.name}` : m.role))).toEqual([
      'a:Looking at the config first.:0',
      'a::3',
      't:bash',
      't:edit_file',
      't:write_file',
      'a:Done.:0',
    ])
  })

  it('marks a failing command, and ends the turn on a real failure but not a reconnect', () => {
    const a = run([{ type: 'item.completed', item: { id: 'i', type: 'command_execution', command: 'false', aggregated_output: '', exit_code: 1, status: 'failed' } }])
    expect(a.ev).toContain('done:bash:false:false')
    const b = run([{ type: 'error', message: 'Reconnecting... 2/5' }])
    expect(b.r.error).toBeUndefined()
    const c = run([{ type: 'turn.failed', error: { message: 'not signed in' } }])
    expect(c.r.error).toBe('not signed in')
  })

  it('unwraps the shell and picks the sandbox from the mode', () => {
    expect(unwrapShell(`/bin/zsh -lc "npm test"`)).toBe('npm test')
    expect(unwrapShell('npm test')).toBe('npm test')
    const a = codexArgs({ model: 'gpt-6.1-sol', effort: 'high', mode: 'auto', cwd: '/w', resume: 'th1' })
    expect(a.join(' ')).toBe('exec --json --skip-git-repo-check -C /w --sandbox workspace-write -m gpt-6.1-sol -c model_reasoning_effort="high" resume th1 -')
    expect(codexArgs({ model: 'm', mode: 'manual', cwd: '/w' })).toContain('read-only')
  })
})

describe('models', () => {
  it('knows models by id and by the names people type', () => {
    expect(findModel('claude-code', 'opus')?.id).toBe('claude-opus-5-5')
    expect(findModel('claude-code', 'claude-sonnet-5.5')?.id).toBe('claude-sonnet-5-5')
    expect(findModel('codex', 'nope')).toBeNull()
    expect(modelEfforts('claude-code', 'haiku')).toContain('max')
    expect(modelEfforts('claude-code', 'claude-haiku-4-5')).toBeNull()
  })

  it('lets models.json add or replace a model without an app update', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-models-'))
    fs.writeFileSync(path.join(dir, 'models.json'), JSON.stringify({ codex: [{ id: 'gpt-7', name: 'GPT-7', window: 500000 }, { id: 'gpt-6-luna', name: 'Luna (mine)' }] }))
    const list = subscriptionModels('codex', dir)
    expect(list[0].id).toBe('gpt-7')
    expect(list.find((m) => m.id === 'gpt-6-luna')?.name).toBe('Luna (mine)')
    expect(list.filter((m) => m.id === 'gpt-6-luna')).toHaveLength(1)
    fs.writeFileSync(path.join(dir, 'models.json'), '{ not json')
    expect(subscriptionModels('codex', dir)[0].id).toBe('gpt-6.1-sol')
  })
})

describe('catching a CLI up on a chat it was not part of', () => {
  it('sends the latest stretch as plain text and skips tool noise', () => {
    const text = catchUp([
      { role: 'user', content: 'fix the bug' },
      { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'bash', args: {} }] },
      { role: 'tool', toolCallId: '1', name: 'bash', content: 'lots of output' },
      { role: 'assistant', content: 'Fixed it.' },
    ])
    expect(text).toBe('User: fix the bug\n\nAssistant: Fixed it.')
    expect(catchUp([{ role: 'user', content: 'a'.repeat(50) }, { role: 'user', content: 'b'.repeat(50) }], 70)).toBe(`User: ${'b'.repeat(50)}`)
  })
})
