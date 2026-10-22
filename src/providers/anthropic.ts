import type { ChatRequest, ChatResult, Msg, Profile, Provider, ToolCall } from '../types.js'
import { DEFAULT_BASE_URLS } from '../config.js'
import { claudeMaxTokens, claudeThinking, clampEffort, effortLevels, thinkingBudget } from '../effort.js'
import { parseArgs, postJson, sseData } from './sse.js'

export function toAnthropicMessages(messages: Msg[]) {
  const out: any[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant') {
      const blocks: any[] = []
      // Signed thinking blocks must go back exactly as received for tool use to continue.
      if (Array.isArray(m.meta)) blocks.push(...m.meta)
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args })
      out.push({ role: 'assistant', content: blocks })
    } else {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content, is_error: m.isError || undefined }
      const last = out[out.length - 1]
      // Consecutive tool results must share one user message.
      if (last?.role === 'user' && Array.isArray(last.content)) last.content.push(block)
      else out.push({ role: 'user', content: [block] })
    }
  }
  return out
}

/**
 * What each model has told us it will not accept, remembered for the session so we only ask once.
 * Reasoning settings differ a lot between Claude generations (adaptive vs a token budget, effort or none),
 * so instead of trusting a table we start from the best guess and let the API correct us.
 */
const rejected = new Map<string, Set<string>>()
const note = (model: string, what: string) => (rejected.get(model) ?? rejected.set(model, new Set()).get(model)!).add(what)
const has = (model: string, what: string) => rejected.get(model)?.has(what) ?? false

type Mode = 'adaptive' | 'budget' | 'none'

function pickMode(model: string): Mode {
  const pref = claudeThinking(model)
  const order: Mode[] = pref === 'budget' ? ['budget', 'adaptive'] : ['adaptive', 'budget']
  return order.find((m) => !has(model, m)) ?? 'none'
}

/** The reasoning part of a request for this model, given the user's effort setting. */
export function reasoningParams(model: string, effort: ChatRequest['effort'], maxTokens: number) {
  const mode = pickMode(model)
  const levels = has(model, 'effort') ? null : effortLevels('anthropic', model)
  const level = levels ? clampEffort(effort ?? 'auto', levels) : null
  const out: { thinking?: any; output_config?: any; mode: Mode } = { mode }
  if (mode === 'adaptive') out.thinking = has(model, 'display') ? { type: 'adaptive' } : { type: 'adaptive', display: 'summarized' }
  else if (mode === 'budget') out.thinking = { type: 'enabled', budget_tokens: thinkingBudget(level, maxTokens) }
  if (level) out.output_config = { effort: level }
  return out
}

export function anthropicProvider(profile: Profile, apiKey?: string): Provider {
  const base = (profile.baseUrl || DEFAULT_BASE_URLS.anthropic).replace(/\/+$/, '')
  return {
    async chat(req: ChatRequest, onText, onThinking): Promise<ChatResult> {
      const model = profile.model
      const body: any = {
        model,
        max_tokens: has(model, 'max_tokens') ? 8192 : claudeMaxTokens(model),
        system: req.system,
        messages: toAnthropicMessages(req.messages),
        stream: true,
      }
      if (req.tools.length) body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }))
      const apply = () => {
        delete body.thinking
        delete body.output_config
        const { mode: _mode, ...reasoning } = reasoningParams(model, req.effort, body.max_tokens)
        Object.assign(body, reasoning)
      }
      apply()

      const send = () => postJson(`${base}/v1/messages`, { 'x-api-key': apiKey ?? '', 'anthropic-version': '2023-06-01' }, body, req.signal)
      let res: Response | undefined
      for (let attempt = 0; attempt < 5 && !res; attempt++) {
        try {
          res = await send()
        } catch (e: any) {
          const msg: string = e?.message ?? ''
          if (!/API error 400/.test(msg)) throw e
          // Work out which setting the model objected to, remember it, and try again without it.
          if (body.thinking && /thinking|budget_tokens|adaptive/i.test(msg)) {
            if (/display/i.test(msg) && body.thinking.display) note(model, 'display')
            else note(model, body.thinking.type === 'adaptive' ? 'adaptive' : 'budget')
          } else if (body.output_config && /effort|output_config/i.test(msg)) note(model, 'effort')
          else if (/max_tokens/i.test(msg) && body.max_tokens > 8192) note(model, 'max_tokens'), (body.max_tokens = 8192)
          else throw e
          apply()
        }
      }
      if (!res) throw new Error('The model rejected every reasoning setting we tried.')

      let text = ''
      let thinking = ''
      const thought = new Map<number, any>()
      const blocks = new Map<number, { id: string; name: string; json: string }>()
      const usage = { input: 0, output: 0 }
      for await (const data of sseData(res)) {
        let ev: any
        try {
          ev = JSON.parse(data)
        } catch {
          continue
        }
        if (ev.type === 'message_start') usage.input = ev.message?.usage?.input_tokens ?? 0
        else if (ev.type === 'message_delta') usage.output = ev.usage?.output_tokens ?? usage.output
        else if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
          blocks.set(ev.index, { id: ev.content_block.id, name: ev.content_block.name, json: '' })
        } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'thinking') {
          thought.set(ev.index, { type: 'thinking', thinking: '', signature: '' })
        } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'redacted_thinking') {
          thought.set(ev.index, ev.content_block)
        } else if (ev.type === 'content_block_delta') {
          if (ev.delta?.type === 'text_delta') {
            text += ev.delta.text
            onText(ev.delta.text)
          } else if (ev.delta?.type === 'thinking_delta') {
            const t = thought.get(ev.index)
            if (t) t.thinking += ev.delta.thinking
            thinking += ev.delta.thinking
            onThinking?.(ev.delta.thinking)
          } else if (ev.delta?.type === 'signature_delta') {
            const t = thought.get(ev.index)
            if (t) t.signature = (t.signature ?? '') + ev.delta.signature
          } else if (ev.delta?.type === 'input_json_delta') {
            const b = blocks.get(ev.index)
            if (b) b.json += ev.delta.partial_json
          }
        } else if (ev.type === 'error') {
          throw new Error(`API error: ${ev.error?.message ?? data}`)
        }
      }
      const toolCalls: ToolCall[] = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => ({ id: b.id, name: b.name, args: parseArgs(b.json) }))
      const meta = thought.size ? [...thought.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b) : undefined
      return { text, thinking, meta, toolCalls, usage }
    },
  }
}
