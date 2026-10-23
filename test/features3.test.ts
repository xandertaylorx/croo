import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runTurn, trimToolImages } from '../src/agent.js'
import { Permissions, PLAN_TOOLS } from '../src/permissions.js'
import { Checkpoints } from '../src/checkpoint.js'
import { expandCommand, frontmatter, loadCommands, loadSkills, skillsBlock } from '../src/commands.js'
import { Hooks, parseHooks, projectHooks } from '../src/hooks.js'
import { TOOLS, readOnlyBash, toolByName } from '../src/tools/index.js'
import { planTool, skillTool, taskTool } from '../src/tools/meta.js'
import { diagnose } from '../src/tools/diagnostics.js'
import { killAllBackground } from '../src/tools/background.js'
import { rewindTo, toItems, typedCount } from '../src/transcript.js'
import { toAnthropicMessages } from '../src/providers/anthropic.js'
import { toOpenAIMessages } from '../src/providers/openai.js'
import { toResponsesInput } from '../src/providers/responses.js'
import { toGeminiContents } from '../src/providers/gemini.js'
import type { ChatRequest, ChatResult, Msg, Provider } from '../src/types.js'

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'croo-f3-')))
const hooks = (log: string[] = [], answer: 'y' | 'n' = 'y') => ({
  onThinking() {},
  onText() {},
  onTextEnd() {},
  onToolRunning: (n: string) => log.push(`start ${n}`),
  onToolDone: (n: string, _s: string, ok: boolean, r: string) => log.push(`done ${n} ${ok ? 'ok' : 'fail'} ${r.slice(0, 60)}`),
  confirm: async (n: string) => (log.push(`ask ${n}`), answer),
  onUsage() {},
  onPlanApproved: () => log.push('approved'),
  onNote: (t: string) => log.push(`note ${t}`),
})

function scripted(replies: ((req: ChatRequest) => Partial<ChatResult>)[]) {
  const requests: ChatRequest[] = []
  const provider: Provider = {
    async chat(req) {
      requests.push(structuredClone({ ...req, signal: undefined }))
      return { text: '', toolCalls: [], usage: { input: 10, output: 5 }, ...replies[Math.min(requests.length - 1, replies.length - 1)](req) }
    },
  }
  return { provider, requests }
}

const call = (name: string, args: Record<string, any>, id = name) => ({ toolCalls: [{ id, name, args }] })

afterEach(() => killAllBackground())

describe('checkpoints', () => {
  it('restores edited and created files to before a turn, earliest copy winning', () => {
    const dir = tmp()
    const data = tmp()
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one')
    const cp = new Checkpoints('s1', data)
    cp.record(0, dir, path.join(dir, 'a.txt'))
    fs.writeFileSync(path.join(dir, 'a.txt'), 'two')
    cp.record(1, dir, path.join(dir, 'a.txt'))
    cp.record(1, dir, path.join(dir, 'new.txt'))
    fs.writeFileSync(path.join(dir, 'a.txt'), 'three')
    fs.writeFileSync(path.join(dir, 'new.txt'), 'made')
    expect(cp.changedFrom(1)).toEqual(['a.txt', 'new.txt'])
    expect(new Checkpoints('s1', data).turnsWithChanges()).toEqual([0, 1])

    expect(cp.restore(1, dir)).toEqual(['a.txt', 'new.txt'])
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('two')
    expect(fs.existsSync(path.join(dir, 'new.txt'))).toBe(false)
    expect(cp.turnsWithChanges()).toEqual([0])

    cp.restore(0, dir)
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('one')
    expect(fs.existsSync(path.join(data, 'checkpoints', 's1.json'))).toBe(false)
  })

  it('records through the file tools during a turn', async () => {
    const dir = tmp()
    const data = tmp()
    fs.writeFileSync(path.join(dir, 'f.ts'), 'const a = 1\n')
    const cp = new Checkpoints('s2', data)
    const { provider } = scripted([() => call('edit_file', { path: 'f.ts', old_string: '1', new_string: '2' }), () => call('write_file', { path: 'g.ts', content: 'x' }, 'w'), () => ({ text: 'done' })])
    await runTurn({ provider, system: '', messages: [{ role: 'user', content: 'go' }], cwd: dir, permissions: new Permissions('auto'), hooks: hooks(), signal: new AbortController().signal, beforeWrite: (abs) => cp.record(0, dir, abs) })
    expect(fs.readFileSync(path.join(dir, 'f.ts'), 'utf8')).toBe('const a = 2\n')
    cp.restore(0, dir)
    expect(fs.readFileSync(path.join(dir, 'f.ts'), 'utf8')).toBe('const a = 1\n')
    expect(fs.existsSync(path.join(dir, 'g.ts'))).toBe(false)
  })

  it('numbers turns by typed messages only', () => {
    const msgs: Msg[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'x' },
      { role: 'user', content: 'hook said no', auto: true },
      { role: 'assistant', content: 'y' },
      { role: 'user', content: 'b' },
    ]
    expect(typedCount(msgs)).toBe(2)
    expect(toItems(msgs).map((i) => i.kind)).toEqual(['user', 'assistant', 'note', 'assistant', 'user'])
    expect(rewindTo(msgs, 1)?.content).toBe('b')
    expect(msgs).toHaveLength(4)
  })
})

describe('plan mode', () => {
  it('only offers read-only tools until the plan is approved, then switches to auto', async () => {
    const dir = tmp()
    const log: string[] = []
    const permissions = new Permissions('plan')
    const offered: string[][] = []
    const tools = () => (permissions.mode === 'plan' ? [...TOOLS.filter((t) => PLAN_TOOLS.has(t.spec.name)).map((t) => (t.spec.name === 'bash' ? readOnlyBash : t)), planTool] : TOOLS)
    const { provider } = scripted([
      (r) => (offered.push(r.tools.map((t) => t.name)), call('bash', { command: 'echo hi > x.txt' }, 'b')),
      (r) => (offered.push(r.tools.map((t) => t.name)), call('propose_plan', { plan: '# Plan\n- write x.txt' }, 'p')),
      (r) => (offered.push(r.tools.map((t) => t.name)), call('write_file', { path: 'x.txt', content: 'hi' }, 'w')),
      () => ({ text: 'done' }),
    ])
    const messages: Msg[] = [{ role: 'user', content: 'plan it' }]
    await runTurn({ provider, system: '', messages, cwd: dir, permissions, hooks: hooks(log), signal: new AbortController().signal, tools })
    expect(offered[0]).not.toContain('write_file')
    expect(offered[0]).toContain('propose_plan')
    expect((messages[2] as any).content).toMatch(/^Refused/)
    expect(fs.readFileSync(path.join(dir, 'x.txt'), 'utf8')).toBe('hi')
    expect(log).toContain('ask propose_plan')
    expect(log).toContain('approved')
    expect(permissions.mode).toBe('auto')
    expect(offered[2]).toContain('write_file')
  })

  it('keeps planning when the plan is turned down', async () => {
    const permissions = new Permissions('plan')
    const { provider } = scripted([() => call('propose_plan', { plan: 'p' }), () => ({ text: 'ok' })])
    const messages: Msg[] = [{ role: 'user', content: 'x' }]
    await runTurn({ provider, system: '', messages, cwd: tmp(), permissions, hooks: hooks([], 'n'), signal: new AbortController().signal, tools: [planTool] })
    expect(permissions.mode).toBe('plan')
    expect((messages[2] as any).content).toMatch(/still in plan mode/)
  })

  it('refuses a file tool that plan mode did not offer, even by name', async () => {
    const dir = tmp()
    const { provider } = scripted([() => call('write_file', { path: 'x.txt', content: 'hi' }), () => ({ text: 'ok' })])
    const messages: Msg[] = [{ role: 'user', content: 'x' }]
    await runTurn({ provider, system: '', messages, cwd: dir, permissions: new Permissions('plan'), hooks: hooks(), signal: new AbortController().signal, tools: [planTool] })
    expect(fs.existsSync(path.join(dir, 'x.txt'))).toBe(false)
    expect((messages[2] as any).content).toMatch(/not available right now \(plan mode is on/)
  })

  it('asks for the plan even in bypass mode, and never for safe reads in plan mode', () => {
    expect(new Permissions('bypass').needsApproval('propose_plan')).toBe(true)
    const p = new Permissions('plan')
    expect(p.needsApproval('bash', { command: 'rm -rf /' })).toBe(false) // readOnlyBash refuses it instead
    expect(p.needsApproval('web_fetch')).toBe(true)
    expect(p.needsApproval('browser', { action: 'navigate', url: 'http://localhost:3000' })).toBe(false)
    expect(p.needsApproval('browser', { action: 'navigate', url: 'https://example.com' })).toBe(true)
  })
})

describe('subagents', () => {
  it('runs a read-only agent with fresh context and returns its report', async () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'the answer is 42')
    const messages: Msg[] = [{ role: 'user', content: 'go' }]
    // One scripted provider serves the parent and the child; the child starts with exactly one message.
    const parentThenChildren = scripted([
      () => ({ toolCalls: [{ id: 't1', name: 'task', args: { description: 'Find it', prompt: 'What is the answer in secret.txt?' } }] }),
      (r) => (r.messages.length === 1 ? (expect(r.tools.map((t) => t.name)).toEqual(['read_file', 'list_files', 'grep', 'bash', 'skill']), call('read_file', { path: 'secret.txt' }, 'r')) : r.messages.some((m) => m.role === 'tool' && m.name === 'task') ? { text: 'Parent done' } : { text: 'Report: 42 (secret.txt:1)' }),
    ])
    await runTurn({ provider: parentThenChildren.provider, system: '', messages, cwd: dir, permissions: new Permissions('auto'), hooks: hooks(), signal: new AbortController().signal, tools: [...TOOLS, taskTool] })
    const result = messages.find((m) => m.role === 'tool' && m.name === 'task') as any
    expect(result.content).toBe('Report: 42 (secret.txt:1)')
    expect(messages.at(-1)?.content).toBe('Parent done')
    // The parent's conversation does not contain the child's read.
    expect(messages.some((m) => m.role === 'tool' && m.name === 'read_file')).toBe(false)
  })
})

describe('commands and skills', () => {
  it('loads project commands, fills in arguments and leaves /init alone', () => {
    const dir = tmp()
    fs.mkdirSync(path.join(dir, '.croo', 'commands'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.croo', 'commands', 'review.md'), '---\ndescription: Review a file\nargument-hint: <file>\n---\nReview $ARGUMENTS carefully.')
    fs.writeFileSync(path.join(dir, '.croo', 'commands', 'plain.md'), '# Ship it\nRun the release.')
    fs.writeFileSync(path.join(dir, '.croo', 'commands', 'init.md'), 'not allowed')
    const cmds = loadCommands(dir)
    expect(cmds.map((c) => c.name)).toEqual(['plain', 'review'])
    expect(cmds.find((c) => c.name === 'review')).toMatchObject({ description: 'Review a file', argumentHint: '<file>', source: 'project' })
    expect(cmds.find((c) => c.name === 'plain')?.description).toBe('Ship it')
    expect(expandCommand('/review src/a.ts', dir)).toBe('Review src/a.ts carefully.')
    expect(expandCommand('/plain now please', dir)).toBe('# Ship it\nRun the release.\n\nnow please')
    expect(expandCommand('/nope', dir)).toBeNull()
    expect(expandCommand('/init', dir)).toBeNull()
  })

  it('lists skills in the prompt and loads them with the skill tool', async () => {
    const dir = tmp()
    const sk = path.join(dir, '.claude', 'skills', 'deploy')
    fs.mkdirSync(sk, { recursive: true })
    fs.writeFileSync(path.join(sk, 'SKILL.md'), '---\nname: deploy\ndescription: How to deploy this app\n---\nRun make deploy.')
    fs.writeFileSync(path.join(sk, 'notes.md'), 'extra')
    const skills = loadSkills(dir)
    expect(skills.map((s) => s.name)).toEqual(['deploy'])
    expect(skillsBlock(skills)).toContain('- deploy: How to deploy this app')
    expect(await skillTool.run({ name: 'deploy' }, { cwd: dir })).toContain('Run make deploy.\n\n---\nFiles in this skill')
    expect(await skillTool.run({ name: 'deploy', file: 'notes.md' }, { cwd: dir })).toBe('extra')
    await expect(skillTool.run({ name: 'deploy', file: '../../../x' }, { cwd: dir })).rejects.toThrow(/outside/)
  })

  it('parses frontmatter', () => {
    expect(frontmatter('---\nname: "x"\n---\nbody')).toEqual({ fields: { name: 'x' }, body: 'body' })
    expect(frontmatter('no front')).toEqual({ fields: {}, body: 'no front' })
  })
})

describe('hooks', () => {
  it('reads both the flat and the Claude Code shape', () => {
    expect(parseHooks('{"PreToolUse":[{"matcher":"bash","command":"a"}]}')).toEqual({ PreToolUse: [{ matcher: 'bash', command: 'a', timeout: undefined }] })
    expect(parseHooks('{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"b"}]}]}}')).toEqual({ Stop: [{ matcher: undefined, command: 'b', timeout: undefined }] })
    expect(parseHooks('nope')).toEqual({})
  })

  it('fingerprints the project file so changing it asks again', () => {
    const dir = tmp()
    fs.mkdirSync(path.join(dir, '.croo'))
    fs.writeFileSync(path.join(dir, '.croo', 'hooks.json'), '{"Stop":[{"command":"npm test"}]}')
    const a = projectHooks(dir)!
    expect(a.commands).toEqual(['Stop: npm test'])
    fs.writeFileSync(path.join(dir, '.croo', 'hooks.json'), '{"Stop":[{"command":"rm -rf ~"}]}')
    expect(projectHooks(dir)!.hash).not.toBe(a.hash)
  })

  it('blocks tool calls, adds post-tool feedback and keeps the agent going from a Stop hook', async () => {
    const dir = tmp()
    const log: string[] = []
    const h = new Hooks(
      {
        PreToolUse: [{ matcher: 'write_file', command: `node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const e=JSON.parse(s);if(e.tool_input.path==='bad.txt'){console.error('no bad files');process.exit(2)}})"` }],
        PostToolUse: [{ matcher: 'edit_file|write_file', command: 'echo "lint: $CROO_FILE looks odd" >&2; exit 2' }],
        Stop: [{ command: `test -f ${JSON.stringify(path.join(dir, 'done.txt'))} || (echo "tests still fail" >&2; exit 2)` }],
      },
      dir,
      's',
    )
    const { provider } = scripted([
      () => call('write_file', { path: 'bad.txt', content: 'x' }, 'a'),
      () => call('write_file', { path: 'ok.txt', content: 'x' }, 'b'),
      () => ({ text: 'finished' }),
      () => call('write_file', { path: 'done.txt', content: 'x' }, 'c'),
      () => ({ text: 'really finished' }),
    ])
    const messages: Msg[] = [{ role: 'user', content: 'go' }]
    await runTurn({ provider, system: '', messages, cwd: dir, permissions: new Permissions('auto'), hooks: hooks(log), signal: new AbortController().signal, lifecycle: h })
    expect(fs.existsSync(path.join(dir, 'bad.txt'))).toBe(false)
    expect((messages[2] as any).content).toMatch(/blocked this call:\nno bad files/)
    expect((messages[4] as any).content).toMatch(/PostToolUse hook reported:\nlint: .*ok\.txt looks odd/)
    const auto = messages.find((m) => m.role === 'user' && m.auto) as any
    expect(auto.content).toContain('tests still fail')
    expect(log.some((l) => l.startsWith('note Stop hook: tests still fail'))).toBe(true)
    expect(messages.at(-1)?.content).toBe('really finished')
  })
})

describe('background commands', () => {
  it('starts, reads and stops a long-running command', async () => {
    const dir = tmp()
    const bash = toolByName('bash')!
    const started = String(await bash.run({ command: 'echo ready; sleep 30', run_in_background: true }, { cwd: dir }))
    expect(started).toMatch(/^Started in the background as (bg\d+)/)
    const id = /as (bg\d+)/.exec(started)![1]
    expect(started).toContain('ready')
    expect(String(await toolByName('bash_output')!.run({ id }, { cwd: dir }))).toMatch(/Status: running\n\(no new output\)/)
    expect(String(await toolByName('bash_kill')!.run({ id }, { cwd: dir }))).toMatch(/^Stopped/)
    expect(String(await toolByName('bash_output')!.run({ id }, { cwd: dir }))).toMatch(/No background command/)
  })

  it('needs no approval to read or stop one, and asks to start an unknown one', () => {
    const p = new Permissions('auto')
    expect(p.needsApproval('bash_output')).toBe(false)
    expect(p.needsApproval('bash_kill')).toBe(false)
    expect(p.needsApproval('bash', { command: 'npm run dev', run_in_background: true })).toBe(true)
  })
})

describe('diagnostics', () => {
  it('reports syntax errors in JSON and JavaScript, and nothing for clean files', async () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'a.json'), '{"x": }')
    fs.writeFileSync(path.join(dir, 'b.js'), 'function (')
    fs.writeFileSync(path.join(dir, 'c.js'), 'const ok = 1\n')
    const out = await diagnose(dir, ['a.json', 'b.js', 'c.js'].map((f) => path.join(dir, f)))
    expect(out).toMatch(/Diagnostics after this change/)
    expect(out).toMatch(/a\.json: invalid JSON/)
    expect(out).toMatch(/b\.js: SyntaxError/)
    expect(out).not.toMatch(/c\.js/)
    expect(await diagnose(dir, [path.join(dir, 'c.js')])).toBe('')
  })

  it('reports type errors from the project compiler on the edited file', async () => {
    const root = path.resolve('.')
    const dir = fs.mkdtempSync(path.join(root, 'test', 'fixtures', 'diag-'))
    try {
      fs.mkdirSync(path.join(dir, 'node_modules', '.bin'), { recursive: true })
      fs.symlinkSync(path.join(root, 'node_modules', '.bin', 'tsc'), path.join(dir, 'node_modules', '.bin', 'tsc'))
      fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{"compilerOptions":{"strict":true,"noEmit":true,"types":[]},"include":["*.ts"]}')
      fs.writeFileSync(path.join(dir, 'x.ts'), 'export const n: number = "no"\n')
      const out = await diagnose(dir, [path.join(dir, 'x.ts')])
      expect(out).toMatch(/x\.ts:1:\d+ TS2322/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('adds the report to the edit result in the agent loop', async () => {
    const dir = tmp()
    const log: string[] = []
    const { provider } = scripted([() => call('write_file', { path: 'bad.json', content: '{' }), () => ({ text: 'ok' })])
    const messages: Msg[] = [{ role: 'user', content: 'x' }]
    await runTurn({ provider, system: '', messages, cwd: dir, permissions: new Permissions('auto'), hooks: hooks(log), signal: new AbortController().signal, diagnostics: true })
    expect((messages[2] as any).content).toMatch(/Created bad\.json[\s\S]*invalid JSON/)
    expect(log).toContain('start diagnostics')
    expect(log.some((l) => l.startsWith('done diagnostics fail'))).toBe(true)
  })
})

describe('tool images', () => {
  const img = { name: 's.jpg', mime: 'image/jpeg', data: 'AAAA' }
  const msgs: Msg[] = [
    { role: 'user', content: 'look' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'browser', args: {} }, { id: 'b', name: 'read_file', args: {} }] },
    { role: 'tool', toolCallId: 'a', name: 'browser', content: 'Screenshot', images: [img] },
    { role: 'tool', toolCallId: 'b', name: 'read_file', content: 'text' },
    { role: 'assistant', content: 'looks fine' },
  ]

  it('keeps only the newest screenshots for the model', () => {
    const many = [...msgs, ...msgs, ...msgs]
    const trimmed = trimToolImages(many, 2)
    expect(trimmed.filter((m) => m.role === 'tool' && m.images).length).toBe(2)
    expect((trimmed[2] as any).content).toMatch(/older screenshot was removed/)
    expect(many.filter((m) => m.role === 'tool' && m.images).length).toBe(3)
  })

  it('sends them in each provider format without breaking tool-result order', () => {
    const anth = toAnthropicMessages(msgs)
    expect(anth[2].content[0].content[1]).toMatchObject({ type: 'image', source: { data: 'AAAA' } })
    const oa = toOpenAIMessages('s', msgs)
    expect(oa.map((m: any) => m.role)).toEqual(['system', 'user', 'assistant', 'tool', 'tool', 'user', 'assistant'])
    expect(oa[5].content[1].image_url.url).toBe('data:image/jpeg;base64,AAAA')
    const rs = toResponsesInput(msgs)
    expect(rs.map((m: any) => m.type ?? m.role)).toEqual(['user', 'function_call', 'function_call', 'function_call_output', 'function_call_output', 'user', 'assistant'])
    const gm = toGeminiContents(msgs)
    expect(gm[2].parts.map((p: any) => Object.keys(p)[0])).toEqual(['functionResponse', 'functionResponse', 'inlineData'])
  })

  it('shows the screenshot on the tool card of a saved chat', () => {
    const items = toItems(msgs)
    expect(items.find((i) => i.kind === 'tool' && i.name === 'browser')).toMatchObject({ image: 'data:image/jpeg;base64,AAAA' })
  })
})
