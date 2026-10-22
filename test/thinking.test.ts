import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { anthropicProvider, toAnthropicMessages } from '../src/providers/anthropic.js'
import { openaiProvider } from '../src/providers/openai.js'
import { INSTRUCTION_FILES, INIT_PROMPT, buildSystemPrompt, instructionFiles, loadProjectInstructions } from '../src/prompt.js'
import { toItems } from '../src/transcript.js'

let server: http.Server
let base = ''
const bodies: any[] = []

const sse = (res: http.ServerResponse, events: unknown[]) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  for (const e of events) res.write(`data: ${JSON.stringify(e)}\n\n`)
  res.end()
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      const parsed = JSON.parse(body)
      bodies.push(parsed)
      if (req.url?.startsWith('/v1/messages')) {
        // Reject extended thinking once, like an older model would.
        if (parsed.thinking && parsed.model === 'old-model') {
          res.writeHead(400)
          return res.end('{"error":{"message":"thinking is not supported for this model"}}')
        }
        sse(res, [
          { type: 'message_start', message: { usage: { input_tokens: 5 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Let me ' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'think.' } },
          { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig123' } },
          { type: 'content_block_start', index: 1, content_block: { type: 'text' } },
          { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Done.' } },
          { type: 'message_delta', usage: { output_tokens: 7 } },
        ])
      } else {
        sse(res, [
          { choices: [{ delta: { reasoning_content: 'hmm ' } }] },
          { choices: [{ delta: { reasoning: 'ok' } }] },
          { choices: [{ delta: { content: 'Answer' } }] },
          { choices: [], usage: { prompt_tokens: 1, completion_tokens: 2 } },
        ])
      }
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => server.close())

const req = (model = 'm') => ({ system: 's', messages: [{ role: 'user' as const, content: 'hi' }], tools: [], model })

describe('reasoning streams', () => {
  it('anthropic: streams thinking, keeps the signed block for the next turn', async () => {
    const seen: string[] = []
    const res = await anthropicProvider({ type: 'anthropic', model: 'claude-x', baseUrl: base }, 'k').chat(req(), () => {}, (d) => seen.push(d))
    expect(seen.join('')).toBe('Let me think.')
    expect(res.text).toBe('Done.')
    expect(res.meta).toEqual([{ type: 'thinking', thinking: 'Let me think.', signature: 'sig123' }])
    expect(bodies.at(-1).thinking).toMatchObject({ type: 'enabled' })
    const wire = toAnthropicMessages([{ role: 'assistant', content: 'Done.', meta: res.meta }])
    expect(wire[0].content[0]).toMatchObject({ type: 'thinking', signature: 'sig123' })
    expect(wire[0].content[1]).toMatchObject({ type: 'text' })
  })
  it('anthropic: retries without thinking when the model rejects it', async () => {
    const res = await anthropicProvider({ type: 'anthropic', model: 'old-model', baseUrl: base }, 'k').chat(req(), () => {})
    expect(res.text).toBe('Done.')
    expect(bodies.at(-1).thinking).toBeUndefined()
  })
  it('openai-compatible: reads reasoning_content and reasoning', async () => {
    const seen: string[] = []
    const res = await openaiProvider({ type: 'openai', model: 'm', baseUrl: base }, 'k').chat(req(), () => {}, (d) => seen.push(d))
    expect(seen.join('')).toBe('hmm ok')
    expect(res.thinking).toBe('hmm ok')
    expect(res.text).toBe('Answer')
  })
  it('shows saved reasoning in the transcript, and /init as "/init"', () => {
    const items = toItems([
      { role: 'user', content: INIT_PROMPT, display: '/init' },
      { role: 'assistant', content: 'wrote it', thinking: 'planning' },
    ])
    expect(items).toEqual([
      { kind: 'user', text: '/init' },
      { kind: 'thinking', text: 'planning', done: true },
      { kind: 'assistant', text: 'wrote it' },
    ])
  })
})

describe('project instructions', () => {
  it('reads AGENTS.md and CLAUDE.md together, skipping empty ones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-'))
    expect(instructionFiles(dir)).toEqual([])
    expect(loadProjectInstructions(dir)).toBeNull()
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'Use tabs.')
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'Run npm test.')
    fs.writeFileSync(path.join(dir, 'CROO.md'), '')
    expect(INSTRUCTION_FILES).toContain('CLAUDE.md')
    expect(instructionFiles(dir)).toEqual(['AGENTS.md', 'CLAUDE.md'])
    const prompt = buildSystemPrompt(dir)
    expect(prompt).toContain('Use tabs.')
    expect(prompt).toContain('Run npm test.')
  })
})
