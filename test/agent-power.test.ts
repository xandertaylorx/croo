import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runTurn } from '../src/agent.js'
import { Permissions } from '../src/permissions.js'
import { compact, contextWindow, isContextOverflow, modelView, splitPoint } from '../src/compact.js'
import { withCacheBreakpoints, toAnthropicMessages } from '../src/providers/anthropic.js'
import { toolByName, TOOLS } from '../src/tools/index.js'
import { setRipgrepDir, ripgrep } from '../src/tools/rg.js'
import { htmlToText } from '../src/tools/web.js'
import { toItems } from '../src/transcript.js'
import { costOf } from '../src/cost.js'
import type { ChatRequest, ChatResult, Msg, Provider } from '../src/types.js'

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'croo-power-')))
const hooks = (log: string[] = []) => ({
  onThinking() {},
  onText() {},
  onTextEnd() {},
  onToolRunning: (n: string) => log.push(`start ${n}`),
  onToolDone: (n: string) => log.push(`done ${n}`),
  confirm: async () => 'y' as const,
  onUsage() {},
  onCompacted: () => log.push('compacted'),
})

/** A provider that answers from a script and records every request. */
function scripted(replies: ((req: ChatRequest) => Partial<ChatResult>)[]) {
  const requests: ChatRequest[] = []
  const provider: Provider = {
    async chat(req) {
      requests.push(structuredClone({ ...req, signal: undefined }))
      const r = replies[Math.min(requests.length - 1, replies.length - 1)](req)
      if (r instanceof Error) throw r
      return { text: '', toolCalls: [], usage: { input: 10, output: 5 }, ...r }
    },
  }
  return { provider, requests }
}

describe('compaction', () => {
  const convo = (n: number): Msg[] => {
    const out: Msg[] = []
    for (let i = 0; i < n; i++) {
      out.push({ role: 'user', content: `question ${i} ${'x'.repeat(400)}` })
      out.push({ role: 'assistant', content: '', toolCalls: [{ id: `c${i}`, name: 'read_file', args: { path: 'a' } }] })
      out.push({ role: 'tool', toolCallId: `c${i}`, name: 'read_file', content: 'y'.repeat(400) })
      out.push({ role: 'assistant', content: `answer ${i}` })
    }
    return out
  }

  it('never starts the kept tail on a tool result', () => {
    const msgs = convo(10)
    for (const keep of [10, 100, 150, 300, 1000]) {
      const cut = splitPoint(msgs, 0, keep)
      expect(cut).toBeGreaterThan(0)
      expect(msgs[cut].role).not.toBe('tool')
    }
  })

  it('sends the summary plus the tail, and keeps the full history for the chat', async () => {
    const msgs = convo(10)
    const { provider, requests } = scripted([() => ({ text: 'SUMMARY OF WORK' })])
    const res = await compact({ provider, messages: msgs, window: 1000 })
    expect(res).toBeTruthy()
    expect(requests[0].tools).toEqual([])
    expect(requests[0].messages[0].content).toMatch(/<conversation>[\s\S]*question \d/)
    expect(msgs).toHaveLength(40)
    const view = modelView(msgs)
    expect(view.length).toBeLessThan(40)
    expect(view[0].role).toBe('user')
    expect(view[0].content).toContain('SUMMARY OF WORK')
    expect(view.some((m) => m.content.includes('question 0'))).toBe(false)
    expect(toItems(msgs).some((i) => i.kind === 'note')).toBe(true)
    // Anthropic: tool results still follow their calls.
    const anth = toAnthropicMessages(view)
    expect(anth[0].role).toBe('user')
    for (let i = 1; i < anth.length; i++) expect(anth[i].role).not.toBe(anth[i - 1].role)
  })

  it('summarizes again on top of an earlier summary', async () => {
    const msgs = convo(20)
    const { provider, requests } = scripted([() => ({ text: 'FIRST' }), () => ({ text: 'SECOND' })])
    await compact({ provider, messages: msgs, window: 2000 })
    await compact({ provider, messages: msgs, window: 1000 })
    expect(requests[1].messages[0].content).toContain('FIRST')
    expect(modelView(msgs)[0].content).toContain('SECOND')
    expect(modelView(msgs)[0].content).not.toContain('FIRST')
  })

  it('compacts and retries when the provider says the prompt is too long', async () => {
    const msgs = convo(10)
    msgs.push({ role: 'user', content: 'go on' })
    let calls = 0
    const { provider, requests } = scripted([
      () => {
        calls++
        return new Error('API error 400: prompt is too long: 250000 tokens > 200000 maximum') as any
      },
      () => ({ text: 'THE SUMMARY' }),
      () => ({ text: 'continuing' }),
    ])
    const log: string[] = []
    await runTurn({ provider, system: 's', messages: msgs, cwd: tmp(), permissions: new Permissions('auto'), hooks: hooks(log), signal: new AbortController().signal, contextWindow: 1000 })
    expect(calls).toBe(1)
    expect(log).toContain('compacted')
    expect(requests[2].messages[0].content).toContain('THE SUMMARY')
    expect(msgs[msgs.length - 1].content).toBe('continuing')
  })

  it('compacts before the next step once the window is nearly full', async () => {
    const msgs = convo(10)
    msgs.push({ role: 'user', content: 'go on' })
    const cwd = tmp()
    fs.writeFileSync(path.join(cwd, 'a'), 'hi')
    const { provider, requests } = scripted([
      () => ({ toolCalls: [{ id: 't', name: 'read_file', args: { path: 'a' } }], usage: { input: 100, output: 5, cacheRead: 800 } }),
      () => ({ text: 'SUM' }),
      () => ({ text: 'done' }),
    ])
    const log: string[] = []
    await runTurn({ provider, system: 's', messages: msgs, cwd, permissions: new Permissions('auto'), hooks: hooks(log), signal: new AbortController().signal, contextWindow: 1000 })
    expect(log).toContain('compacted')
    expect(requests[1].tools).toEqual([])
    expect(requests[2].messages[0].content).toContain('SUM')
  })

  it('recognises overflow errors and sizes windows', () => {
    expect(isContextOverflow(new Error("This model's maximum context length is 128000 tokens"))).toBe(true)
    expect(isContextOverflow(new Error('API error 429: rate limited'))).toBe(false)
    expect(contextWindow('claude-opus-5-5')).toBe(200_000)
    expect(contextWindow('anything', true)).toBe(16_384)
  })
})

describe('parallel read-only tools', () => {
  it('runs independent reads together and keeps result order', async () => {
    const cwd = tmp()
    for (const f of ['a', 'b', 'c']) fs.writeFileSync(path.join(cwd, f), f)
    const { provider } = scripted([
      () => ({ toolCalls: ['a', 'b', 'c'].map((f) => ({ id: f, name: 'read_file', args: { path: f } })) }),
      () => ({ text: 'ok' }),
    ])
    const log: string[] = []
    const msgs: Msg[] = [{ role: 'user', content: 'read' }]
    await runTurn({ provider, system: 's', messages: msgs, cwd, permissions: new Permissions('auto'), hooks: hooks(log), signal: new AbortController().signal })
    // All three start before any finishes.
    expect(log.slice(0, 3)).toEqual(['start read_file', 'start read_file', 'start read_file'])
    expect(msgs.filter((m) => m.role === 'tool').map((m) => (m as any).toolCallId)).toEqual(['a', 'b', 'c'])
  })
})

describe('prompt caching', () => {
  it('marks tools, system and the last message', () => {
    const body = withCacheBreakpoints({
      system: 'sys',
      tools: [{ name: 'a' }, { name: 'b' }],
      messages: toAnthropicMessages([
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'x', name: 'a', args: {} }] },
        { role: 'tool', toolCallId: 'x', name: 'a', content: 'r' },
      ]),
    })
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(body.tools![1].cache_control).toBeTruthy()
    expect(body.tools![0].cache_control).toBeUndefined()
    expect(body.messages[2].content[0].cache_control).toBeTruthy()
    expect(body.messages[0].content).toBe('hi')
  })

  it('prices cache reads and writes', () => {
    expect(costOf({ input: 0, output: 0, cacheRead: 1e6 }, { input: 10, output: 0 })).toBeCloseTo(1)
    expect(costOf({ input: 0, output: 0, cacheWrite: 1e6 }, { input: 10, output: 0 })).toBeCloseTo(12.5)
  })
})

describe('tools', () => {
  const ctx = (cwd: string) => ({ cwd })
  afterEach(() => setRipgrepDir(path.resolve('vendor/rg')))

  it('multi_edit applies all edits or none', async () => {
    const cwd = tmp()
    fs.writeFileSync(path.join(cwd, 'f.ts'), 'one two three')
    const t = toolByName('multi_edit')!
    await t.run({ path: 'f.ts', edits: [{ old_string: 'one', new_string: '1' }, { old_string: 'three', new_string: '3' }] }, ctx(cwd))
    expect(fs.readFileSync(path.join(cwd, 'f.ts'), 'utf8')).toBe('1 two 3')
    await expect(t.run({ path: 'f.ts', edits: [{ old_string: 'two', new_string: '2' }, { old_string: 'nope', new_string: 'x' }] }, ctx(cwd))).rejects.toThrow(/Edit 2/)
    expect(fs.readFileSync(path.join(cwd, 'f.ts'), 'utf8')).toBe('1 two 3')
  })

  it('todo_write renders the list', async () => {
    const t = toolByName('todo_write')!
    const todos = [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }, { content: 'c', status: 'pending' }]
    expect(await t.run({ todos }, ctx(tmp()))).toBe('[x] a\n[~] b\n[ ] c')
    expect(t.summarize({ todos })).toBe('1/3 done · b')
  })

  for (const engine of ['ripgrep', 'built-in'] as const) {
    it(`grep and list_files work with ${engine}`, async () => {
      setRipgrepDir(engine === 'ripgrep' ? path.resolve('vendor/rg') : '/nonexistent')
      if (engine === 'built-in') process.env.CROO_NO_RG = '1'
      try {
        if (engine === 'ripgrep' && !ripgrep()) return
        const cwd = tmp()
        fs.mkdirSync(path.join(cwd, 'src'))
        fs.writeFileSync(path.join(cwd, 'src', 'a.ts'), 'const foo = 1\nconst bar = 2\n')
        fs.writeFileSync(path.join(cwd, 'src', 'b.js'), 'foo()\n')
        fs.writeFileSync(path.join(cwd, '.gitignore'), 'skip.ts\n')
        fs.writeFileSync(path.join(cwd, 'skip.ts'), 'foo\n')
        const grep = toolByName('grep')!
        expect(await grep.run({ pattern: 'foo' }, ctx(cwd))).toBe('src/a.ts:1:const foo = 1\nsrc/b.js:1:foo()')
        expect(await grep.run({ pattern: 'foo', glob: '*.ts', output_mode: 'files' }, ctx(cwd))).toBe('src/a.ts')
        expect(await grep.run({ pattern: 'const', output_mode: 'count' }, ctx(cwd))).toBe('src/a.ts:2')
        expect(await grep.run({ pattern: 'zzz' }, ctx(cwd))).toBe('(no matches)')
        const list = toolByName('list_files')!
        expect(await list.run({ pattern: 'src/**/*.ts' }, ctx(cwd))).toBe('src/a.ts')
        expect(await list.run({ path: 'src' }, ctx(cwd))).toBe('src/a.ts\nsrc/b.js')
      } finally {
        delete process.env.CROO_NO_RG
      }
    })
  }

  it('turns HTML into readable text', () => {
    const text = htmlToText('<html><head><title>Docs</title><style>x{}</style></head><body><nav>menu</nav><h2>Install</h2><p>Run <code>npm i</code> &amp; go. See <a href="/a">this</a>.</p><ul><li>one</li><li>two</li></ul><script>evil()</script></body></html>')
    expect(text).toContain('# Docs')
    expect(text).toContain('## Install')
    expect(text).toContain('Run `npm i` & go. See [this](/a).')
    expect(text).toContain('- one')
    expect(text).not.toMatch(/evil|menu|x\{\}/)
  })

  it('asks before fetching the web in auto mode, but not for todo lists', () => {
    const p = new Permissions('auto')
    expect(p.needsApproval('web_fetch')).toBe(true)
    expect(p.needsApproval('todo_write')).toBe(false)
    p.allowAlways('web_fetch')
    expect(p.needsApproval('web_fetch')).toBe(false)
    expect(TOOLS.map((t) => t.spec.name)).toEqual(['read_file', 'write_file', 'edit_file', 'multi_edit', 'list_files', 'grep', 'bash', 'bash_output', 'bash_kill', 'web_fetch', 'todo_write'])
  })
})
