import type { ChatRequest, ChatResult, Msg, Profile, Provider, ToolCall } from '../types.js'
import { DEFAULT_BASE_URLS } from '../config.js'
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

/** Models that rejected extended thinking once; we stop asking them. */
const noThinking = new Set<string>()
const THINKING_BUDGET = 4000

export function anthropicProvider(profile: Profile, apiKey?: string): Provider {
  const base = (profile.baseUrl || DEFAULT_BASE_URLS.anthropic).replace(/\/+$/, '')
  return {
    async chat(req: ChatRequest, onText, onThinking): Promise<ChatResult> {
      const body: any = {
        model: profile.model,
        max_tokens: 8192,
        system: req.system,
        messages: toAnthropicMessages(req.messages),
        stream: true,
      }
      if (req.tools.length) body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }))
      if (!noThinking.has(profile.model)) body.thinking = { type: 'enabled', budget_tokens: THINKING_BUDGET }
      const send = () => postJson(`${base}/v1/messages`, { 'x-api-key': apiKey ?? '', 'anthropic-version': '2023-06-01' }, body, req.signal)
      let res: Response
      try {
        res = await send()
      } catch (e: any) {
        // Older or smaller models do not support extended thinking: remember that and retry without it.
        if (!body.thinking || !/thinking|budget_tokens/i.test(e?.message ?? '')) throw e
        noThinking.add(profile.model)
        delete body.thinking
        res = await send()
      }

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
