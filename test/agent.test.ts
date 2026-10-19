import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { runTurn } from '../src/agent.js'
import { Permissions } from '../src/permissions.js'
import { openaiProvider } from '../src/providers/openai.js'
import { toAnthropicMessages } from '../src/providers/anthropic.js'
import { toGeminiContents } from '../src/providers/gemini.js'
import type { Msg } from '../src/types.js'

let server: http.Server
let base = ''
let requests: any[] = []

const sse = (res: http.ServerResponse, chunks: any[]) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`)
  res.end('data: [DONE]\n\n')
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      const parsed = JSON.parse(body)
      requests.push(parsed)
      if (requests.length === 1) {
        sse(res, [
          { choices: [{ delta: { content: 'Writing. ' } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'write_file', arguments: '{"path":"o.txt",' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"content":"hi"}' } }] } }] },
          { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } },
        ])
      } else sse(res, [{ choices: [{ delta: { content: 'Done.' } }] }])
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})
afterAll(() => server.close())

describe('agent loop (mock OpenAI-compatible server)', () => {
  const run = async (yolo: boolean, answer: 'y' | 'n') => {
    requests = []
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'croo-agent-')))
    const messages: Msg[] = [{ role: 'user', content: 'make a file' }]
    let text = ''
    await runTurn({
      provider: openaiProvider({ type: 'openai', model: 'm', baseUrl: base }),
      system: 's',
      messages,
      cwd,
      permissions: new Permissions(yolo),
      signal: new AbortController().signal,
      hooks: {
        onThinking() {},
        onText: (d) => (text += d),
        onTextEnd() {},
        onToolRunning() {},
        onToolDone() {},
        confirm: async () => answer,
        onUsage() {},
      },
    })
    return { cwd, messages, text }
  }

  it('streams text, assembles tool calls, executes and loops', async () => {
    const { cwd, messages, text } = await run(false, 'y')
    expect(text).toBe('Writing. Done.')
    expect(fs.readFileSync(path.join(cwd, 'o.txt'), 'utf8')).toBe('hi')
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(requests[1].messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'c1' })
  })
  it('denied writes do not touch disk and tell the model', async () => {
    const { cwd, messages } = await run(false, 'n')
    expect(fs.existsSync(path.join(cwd, 'o.txt'))).toBe(false)
    expect((messages[2] as any).isError).toBe(true)
  })
  it('yolo never asks', async () => {
    const { cwd } = await run(true, 'n')
    expect(fs.existsSync(path.join(cwd, 'o.txt'))).toBe(true)
  })
})

describe('provider message mapping', () => {
  const msgs: Msg[] = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 't', toolCalls: [{ id: 'a', name: 'bash', args: { command: 'ls' }, meta: 'sig' }, { id: 'b', name: 'grep', args: {} }] },
    { role: 'tool', toolCallId: 'a', name: 'bash', content: 'x' },
    { role: 'tool', toolCallId: 'b', name: 'grep', content: 'y', isError: true },
  ]
  it('anthropic merges consecutive tool results into one user message', () => {
    const out = toAnthropicMessages(msgs)
    expect(out).toHaveLength(3)
    expect(out[2].content).toHaveLength(2)
  })
  it('gemini merges function responses and keeps thought signatures', () => {
    const out = toGeminiContents(msgs)
    expect(out).toHaveLength(3)
    expect(out[1].parts[1].thoughtSignature).toBe('sig')
    expect(out[2].parts).toHaveLength(2)
  })
})

describe('demo provider', () => {
  it('runs a full scripted turn: list_files, write_file, final text', async () => {
    const { demoProvider } = await import('../src/providers/demo.js')
    const cwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'croo-demo-')))
    const messages: Msg[] = [{ role: 'user', content: 'hi' }]
    let text = ''
    await runTurn({
      provider: demoProvider(),
      system: 's',
      messages,
      cwd,
      permissions: new Permissions(true),
      signal: new AbortController().signal,
      hooks: { onThinking() {}, onText: (d) => (text += d), onTextEnd() {}, onToolRunning() {}, onToolDone() {}, confirm: async () => 'y', onUsage() {} },
    })
    expect(fs.existsSync(path.join(cwd, 'croo-demo.txt'))).toBe(true)
    expect(text).toContain('All done')
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant', 'tool', 'assistant'])
  })
})
