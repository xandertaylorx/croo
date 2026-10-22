import type { ChatRequest, ChatResult, Msg, Profile, Provider, ToolCall } from '../types.js'
import { DEFAULT_BASE_URLS } from '../config.js'
import { clampEffort, effortLevels } from '../effort.js'
import { parseArgs, postJson, sseData } from './sse.js'

/**
 * OpenAI's own API. Newer models only take tools (or only exist at all) on /responses, not /chat/completions,
 * so Croo talks to api.openai.com this way and keeps /chat/completions for compatible servers.
 */
export function usesResponses(baseUrl?: string): boolean {
  try {
    return new URL(baseUrl || DEFAULT_BASE_URLS.openai).hostname === 'api.openai.com'
  } catch {
    return false
  }
}

/** Reasoning items from an earlier turn, sent back so the model keeps its chain of thought across tool calls. */
type Meta = { responses: any[] }
const isMeta = (m: unknown): m is Meta => !!m && typeof m === 'object' && Array.isArray((m as Meta).responses)

export function toResponsesInput(messages: Msg[]) {
  const out: any[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      const content: any[] = [{ type: 'input_text', text: m.content }]
      for (const i of m.images ?? []) content.push({ type: 'input_image', image_url: `data:${i.mime};base64,${i.data}` })
      out.push({ role: 'user', content })
    } else if (m.role === 'tool') out.push({ type: 'function_call_output', call_id: m.toolCallId, output: m.content })
    else {
      if (isMeta(m.meta)) out.push(...m.meta.responses)
      if (m.content) out.push({ role: 'assistant', content: m.content })
      for (const c of m.toolCalls ?? []) out.push({ type: 'function_call', call_id: c.id, name: c.name, arguments: JSON.stringify(c.args) })
    }
  }
  return out
}

/** Endpoint|model pairs that turned down the reasoning settings once; we stop sending them. */
const noReasoning = new Set<string>()

export function responsesProvider(profile: Profile, apiKey?: string): Provider {
  const base = (profile.baseUrl || DEFAULT_BASE_URLS.openai).replace(/\/+$/, '')
  return {
    async chat(req: ChatRequest, onText, onThinking): Promise<ChatResult> {
      const body: any = {
        model: profile.model,
        instructions: req.system,
        input: toResponsesInput(req.messages),
        stream: true,
        store: false,
      }
      if (req.tools.length) {
        body.tools = req.tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters }))
      }
      const headers: Record<string, string> = apiKey ? { authorization: `Bearer ${apiKey}` } : {}
      const key = `${base}|${profile.model}`
      const levels = noReasoning.has(key) ? null : effortLevels('openai', profile.model)
      if (levels) {
        const level = clampEffort(req.effort ?? 'auto', levels)
        body.reasoning = { summary: 'auto', ...(level ? { effort: level } : {}) }
        body.include = ['reasoning.encrypted_content']
      }
      let res: Response
      try {
        res = await postJson(`${base}/responses`, headers, body, req.signal)
      } catch (e: any) {
        // Not a reasoning model after all, or reasoning summaries need a verified organization: ask again without.
        if (!body.reasoning || !/API error 400/.test(e?.message ?? '') || !/reasoning|effort|summary|encrypted|include/i.test(e?.message ?? '')) throw e
        noReasoning.add(key)
        delete body.reasoning
        delete body.include
        res = await postJson(`${base}/responses`, headers, body, req.signal)
      }

      let text = ''
      let thinking = ''
      const calls = new Map<string, { index: number; callId: string; name: string; args: string }>()
      const reasoning: any[] = []
      const usage = { input: 0, output: 0 }
      for await (const data of sseData(res)) {
        if (data === '[DONE]') break
        let ev: any
        try {
          ev = JSON.parse(data)
        } catch {
          continue
        }
        switch (ev.type) {
          case 'response.output_text.delta':
            if (ev.delta) {
              text += ev.delta
              onText(ev.delta)
            }
            break
          case 'response.reasoning_summary_text.delta':
          case 'response.reasoning_text.delta':
            if (ev.delta) {
              thinking += ev.delta
              onThinking?.(ev.delta)
            }
            break
          case 'response.reasoning_summary_part.added':
            // Summaries arrive in parts; keep them apart like paragraphs.
            if (thinking && !thinking.endsWith('\n\n')) {
              thinking += '\n\n'
              onThinking?.('\n\n')
            }
            break
          case 'response.output_item.added':
            if (ev.item?.type === 'function_call') {
              calls.set(ev.item.id, { index: ev.output_index ?? calls.size, callId: ev.item.call_id ?? '', name: ev.item.name ?? '', args: ev.item.arguments ?? '' })
            }
            break
          case 'response.function_call_arguments.delta': {
            const c = calls.get(ev.item_id)
            if (c && ev.delta) c.args += ev.delta
            break
          }
          case 'response.output_item.done':
            if (ev.item?.type === 'function_call') {
              const c = calls.get(ev.item.id) ?? { index: ev.output_index ?? calls.size, callId: '', name: '', args: '' }
              calls.set(ev.item.id, { ...c, callId: ev.item.call_id || c.callId, name: ev.item.name || c.name, args: ev.item.arguments ?? c.args })
            } else if (ev.item?.type === 'reasoning') reasoning.push(ev.item)
            break
          case 'response.completed':
          case 'response.incomplete':
            usage.input = ev.response?.usage?.input_tokens ?? usage.input
            usage.output = ev.response?.usage?.output_tokens ?? usage.output
            break
          case 'response.failed':
          case 'error': {
            const err = ev.response?.error ?? ev.error ?? ev
            throw new Error(`API error: ${err?.message ?? 'the response failed'}`)
          }
        }
      }
      const toolCalls: ToolCall[] = [...calls.values()]
        .sort((a, b) => a.index - b.index)
        .map((c, i) => ({ id: c.callId || `call_${i}_${Date.now()}`, name: c.name, args: parseArgs(c.args) }))
      // Only encrypted reasoning can be replayed without server-side storage.
      const replay = reasoning.filter((r) => r.encrypted_content)
      return { text, thinking, toolCalls, usage, meta: replay.length ? { responses: replay } : undefined }
    },
  }
}
