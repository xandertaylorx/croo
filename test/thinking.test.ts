import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { anthropicProvider, toAnthropicMessages } from '../src/providers/anthropic.js'
import { openaiProvider } from '../src/providers/openai.js'
import { INSTRUCTION_FILES, INIT_PROMPT, buildChatPrompt, buildSystemPrompt, instructionFiles, loadProjectInstructions } from '../src/prompt.js'
import { toItems } from '../src/transcript.js'
import { clampEffort, claudeThinking, effortLevels, parseClaude, thinkingBudget } from '../src/effort.js'

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
        // Rules that mimic how real models reject reasoning settings.
        if (parsed.model === 'gateway-model' && parsed.thinking?.type === 'adaptive') {
          res.writeHead(400)
          return res.end('{"error":{"message":"thinking.type.adaptive is not supported for this model"}}')
        }
        if (parsed.model === 'claude-sonnet-4-6' && parsed.output_config) {
          res.writeHead(400)
          return res.end('{"error":{"message":"output_config.effort is not supported for this model"}}')
        }
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
        if (parsed.model === 'gpt-5-reject' && parsed.reasoning_effort) {
          res.writeHead(400)
          return res.end('{"error":{"message":"Unsupported parameter: reasoning_effort"}}')
        }
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
    const res = await anthropicProvider({ type: 'anthropic', model: 'claude-opus-4-8', baseUrl: base }, 'k').chat(req(), () => {}, (d) => seen.push(d))
    expect(seen.join('')).toBe('Let me think.')
    expect(res.text).toBe('Done.')
    expect(res.meta).toEqual([{ type: 'thinking', thinking: 'Let me think.', signature: 'sig123' }])
    expect(bodies.at(-1).thinking).toMatchObject({ type: 'adaptive', display: 'summarized' })
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

const ask = (model: string, effort?: any) => anthropicProvider({ type: 'anthropic', model, baseUrl: base }, 'k').chat({ ...req(), effort }, () => {})

describe('reasoning settings per model', () => {
  it('understands Claude model ids', () => {
    expect(parseClaude('claude-opus-4-8')).toEqual({ family: 'opus', version: 4.8 })
    expect(parseClaude('claude-sonnet-5-5')).toEqual({ family: 'sonnet', version: 5.5 })
    expect(parseClaude('claude-opus-5')).toEqual({ family: 'opus', version: 5 })
    expect(parseClaude('claude-sonnet-4-20250514')).toEqual({ family: 'sonnet', version: 4 })
    expect(parseClaude('anthropic.claude-haiku-4-5-v1:0')).toEqual({ family: 'haiku', version: 4.5 })
    expect(parseClaude('gpt-4o')).toBeNull()
  })
  it('knows which models think adaptively and which take a budget', () => {
    for (const m of ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-haiku-5-5']) expect(claudeThinking(m)).toBe('adaptive')
    for (const m of ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1', 'claude-3-7-sonnet-latest']) expect(claudeThinking(m)).toBe('budget')
    expect(claudeThinking('some-gateway-model')).toBe('unknown')
  })
  it('lists the effort levels each model takes', () => {
    expect(effortLevels('anthropic', 'claude-opus-4-8')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(effortLevels('anthropic', 'claude-sonnet-4-6')).toEqual(['low', 'medium', 'high', 'max'])
    expect(effortLevels('anthropic', 'claude-opus-4-5')).toEqual(['low', 'medium', 'high'])
    expect(effortLevels('anthropic', 'claude-sonnet-4-5')).toBeNull()
    expect(effortLevels('anthropic', 'claude-haiku-4-5')).toBeNull()
    expect(effortLevels('openai', 'o3-mini')).toEqual(['low', 'medium', 'high'])
    expect(effortLevels('openai', 'openai/gpt-5')).toEqual(['low', 'medium', 'high'])
    expect(effortLevels('openai', 'gpt-4o')).toBeNull()
    expect(effortLevels('gemini', 'gemini-2.5-pro')).toEqual(['low', 'medium', 'high'])
    expect(effortLevels('gemini', 'gemini-1.5-flash')).toBeNull()
  })
  it('clamps a level to what a model accepts', () => {
    expect(clampEffort('max', ['low', 'medium', 'high'])).toBe('high')
    expect(clampEffort('xhigh', ['low', 'medium', 'high', 'max'])).toBe('high')
    expect(clampEffort('low', ['low', 'high'])).toBe('low')
    expect(clampEffort('medium', ['low', 'high'])).toBe('low')
    expect(clampEffort('auto', ['low', 'high'])).toBeNull()
    expect(thinkingBudget('high', 32000)).toBe(10000)
    expect(thinkingBudget(null, 2000)).toBe(1024)
  })
  it('sends adaptive thinking with effort to a current model', async () => {
    await ask('claude-opus-4-8', 'xhigh')
    expect(bodies.at(-1).thinking).toEqual({ type: 'adaptive', display: 'summarized' })
    expect(bodies.at(-1).output_config).toEqual({ effort: 'xhigh' })
    expect(bodies.at(-1).max_tokens).toBe(32000)
  })
  it('does not send effort for "auto" or to models without it', async () => {
    await ask('claude-opus-4-8', 'auto')
    expect(bodies.at(-1).output_config).toBeUndefined()
    await ask('claude-sonnet-4-5', 'high')
    expect(bodies.at(-1).output_config).toBeUndefined()
  })
  it('uses a token budget on older models', async () => {
    await ask('claude-sonnet-4-5', 'high')
    expect(bodies.at(-1).thinking.type).toBe('enabled')
    expect(bodies.at(-1).thinking.budget_tokens).toBeGreaterThanOrEqual(1024)
  })
  it('steps down from adaptive to a budget when an unknown model refuses adaptive', async () => {
    const before = bodies.length
    const res = await ask('gateway-model')
    expect(res.text).toBe('Done.')
    expect(bodies.slice(before).map((b) => b.thinking?.type)).toEqual(['adaptive', 'enabled'])
    await ask('gateway-model') // remembered: no failed attempt this time
    expect(bodies.at(-1).thinking.type).toBe('enabled')
  })
  it('drops effort, keeps thinking, when the model refuses effort', async () => {
    const before = bodies.length
    const res = await ask('claude-sonnet-4-6', 'high')
    expect(res.text).toBe('Done.')
    const sent = bodies.slice(before)
    expect(sent).toHaveLength(2)
    expect(sent[0].output_config).toEqual({ effort: 'high' })
    expect(sent[1].output_config).toBeUndefined()
    expect(sent[1].thinking.type).toBe('adaptive')
  })
  it('sends reasoning_effort to reasoning models only, and retries without it if refused', async () => {
    const chat = (model: string) => openaiProvider({ type: 'openai', model, baseUrl: base }, 'k').chat({ ...req(), effort: 'high' }, () => {})
    await chat('o3-mini')
    expect(bodies.at(-1).reasoning_effort).toBe('high')
    await chat('gpt-4o')
    expect(bodies.at(-1).reasoning_effort).toBeUndefined()
    const before = bodies.length
    expect((await chat('gpt-5-reject')).text).toBe('Answer')
    expect(bodies.slice(before).map((b) => b.reasoning_effort)).toEqual(['high', undefined])
  })
})

describe('system prompts', () => {
  it('tell the model which model it really is, so it does not guess', () => {
    const who = { model: 'qwen2.5-coder:3b', provider: 'ollama' }
    for (const prompt of [buildChatPrompt(new Date(), who), buildSystemPrompt(os.tmpdir(), new Date(), who)]) {
      expect(prompt).toContain('qwen2.5-coder:3b')
      expect(prompt).toContain('do not claim to be GPT')
      expect(prompt).toContain('Formatting')
    }
    expect(buildChatPrompt()).not.toContain('underlying language model')
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
