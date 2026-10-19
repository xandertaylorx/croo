import type { ChatRequest, ChatResult, Msg, Profile, Provider, ToolCall } from '../types.js'
import { DEFAULT_BASE_URLS } from '../config.js'
import { parseArgs, postJson, sseData } from './sse.js'

export function toAnthropicMessages(messages: Msg[]) {
  const out: any[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant') {
      const blocks: any[] = []
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

export function anthropicProvider(profile: Profile, apiKey?: string): Provider {
  const base = (profile.baseUrl || DEFAULT_BASE_URLS.anthropic).replace(/\/+$/, '')
  return {
    async chat(req: ChatRequest, onText): Promise<ChatResult> {
      const body: any = {
        model: profile.model,
        max_tokens: 8192,
        system: req.system,
        messages: toAnthropicMessages(req.messages),
        stream: true,
      }
      if (req.tools.length) body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }))
      const res = await postJson(
        `${base}/v1/messages`,
        { 'x-api-key': apiKey ?? '', 'anthropic-version': '2023-06-01' },
        body,
        req.signal,
      )

      let text = ''
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
        } else if (ev.type === 'content_block_delta') {
          if (ev.delta?.type === 'text_delta') {
            text += ev.delta.text
            onText(ev.delta.text)
          } else if (ev.delta?.type === 'input_json_delta') {
            const b = blocks.get(ev.index)
            if (b) b.json += ev.delta.partial_json
          }
        } else if (ev.type === 'error') {
          throw new Error(`API error: ${ev.error?.message ?? data}`)
        }
      }
      const toolCalls: ToolCall[] = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => ({ id: b.id, name: b.name, args: parseArgs(b.json) }))
      return { text, toolCalls, usage }
    },
  }
}
