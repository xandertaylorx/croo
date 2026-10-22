import type { ChatRequest, ChatResult, Msg, Profile, Provider, ToolCall, Usage } from '../types.js'
import { DEFAULT_BASE_URLS } from '../config.js'
import { clampEffort, effortLevels } from '../effort.js'
import { parseArgs, postJson, sseData } from './sse.js'

export function toOpenAIMessages(system: string, messages: Msg[]) {
  const out: any[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({
        role: 'user',
        content: m.images?.length ? [{ type: 'text', text: m.content }, ...m.images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } }))] : m.content,
      })
    }
    else if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content })
    else {
      const msg: any = { role: 'assistant', content: m.content || null }
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }))
      }
      out.push(msg)
    }
  }
  return out
}

/** Endpoints that turned down a reasoning-effort setting once; we stop sending it to them. */
const noEffort = new Set<string>()

/** Works with OpenAI and anything that speaks /chat/completions (OpenRouter, Groq, Ollama, vLLM, ...). */
export function openaiProvider(profile: Profile, apiKey?: string): Provider {
  const base = (profile.baseUrl || DEFAULT_BASE_URLS.openai).replace(/\/+$/, '')
  return {
    async chat(req: ChatRequest, onText, onThinking): Promise<ChatResult> {
      const body: any = {
        model: profile.model,
        messages: toOpenAIMessages(req.system, req.messages),
        stream: true,
        stream_options: { include_usage: true },
      }
      if (req.tools.length) {
        body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
      }
      const headers: Record<string, string> = apiKey ? { authorization: `Bearer ${apiKey}` } : {}
      // Reasoning models (o-series, gpt-5, gpt-oss) take an effort level; OpenRouter spells it differently.
      const key = `${base}|${profile.model}`
      const levels = noEffort.has(key) ? null : effortLevels('openai', profile.model)
      const level = levels ? clampEffort(req.effort ?? 'auto', levels) : null
      if (level) {
        if (base.includes('openrouter.ai')) body.reasoning = { effort: level }
        else body.reasoning_effort = level
      }
      let res: Response
      try {
        res = await postJson(`${base}/chat/completions`, headers, body, req.signal)
      } catch (e: any) {
        // A server that does not know the setting: remember, and ask again without it.
        if (!level || !/API error 4\d\d/.test(e?.message ?? '') || !/reasoning|effort|unsupported|unrecognized|unknown/i.test(e?.message ?? '')) throw e
        noEffort.add(key)
        delete body.reasoning_effort
        delete body.reasoning
        res = await postJson(`${base}/chat/completions`, headers, body, req.signal)
      }

      let text = ''
      let thinking = ''
      const calls = new Map<number, { id: string; name: string; args: string }>()
      const usage: Usage = { input: 0, output: 0 }
      for await (const data of sseData(res)) {
        if (data === '[DONE]') break
        let chunk: any
        try {
          chunk = JSON.parse(data)
        } catch {
          continue
        }
        if (chunk.usage) {
          // prompt_tokens includes what the server's prompt cache served.
          const cached = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0
          usage.input = (chunk.usage.prompt_tokens ?? usage.input) - cached
          usage.output = chunk.usage.completion_tokens ?? usage.output
          if (cached) usage.cacheRead = cached
        }
        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue
        // DeepSeek, Groq and friends stream reasoning as reasoning_content; OpenRouter and Ollama as reasoning.
        const thought = delta.reasoning_content || delta.reasoning
        if (typeof thought === 'string' && thought) {
          thinking += thought
          onThinking?.(thought)
        }
        if (delta.content) {
          text += delta.content
          onText(delta.content)
        }
        for (const tc of delta.tool_calls ?? []) {
          const i = tc.index ?? 0
          const cur = calls.get(i) ?? { id: '', name: '', args: '' }
          if (tc.id) cur.id = tc.id
          if (tc.function?.name) cur.name += tc.function.name
          if (tc.function?.arguments) cur.args += tc.function.arguments
          calls.set(i, cur)
        }
      }
      const toolCalls: ToolCall[] = [...calls.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([i, c]) => ({ id: c.id || `call_${i}_${Date.now()}`, name: c.name, args: parseArgs(c.args) }))
      return { text, thinking, toolCalls, usage }
    },
  }
}
