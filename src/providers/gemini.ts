import type { ChatRequest, ChatResult, Msg, Profile, Provider, ToolCall } from '../types.js'
import { DEFAULT_BASE_URLS } from '../config.js'
import { postJson, sseData } from './sse.js'

export function toGeminiContents(messages: Msg[]) {
  const out: any[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', parts: [{ text: m.content }] })
    else if (m.role === 'assistant') {
      const parts: any[] = []
      if (m.content) parts.push({ text: m.content })
      for (const c of m.toolCalls ?? []) {
        const part: any = { functionCall: { name: c.name, args: c.args } }
        if (c.meta) part.thoughtSignature = c.meta
        parts.push(part)
      }
      out.push({ role: 'model', parts })
    } else {
      const part = { functionResponse: { name: m.name, response: m.isError ? { error: m.content } : { output: m.content } } }
      const last = out[out.length - 1]
      if (last?.role === 'user' && last.parts[0]?.functionResponse) last.parts.push(part)
      else out.push({ role: 'user', parts: [part] })
    }
  }
  return out
}

export function geminiProvider(profile: Profile, apiKey?: string): Provider {
  const base = (profile.baseUrl || DEFAULT_BASE_URLS.gemini).replace(/\/+$/, '')
  return {
    async chat(req: ChatRequest, onText, onThinking): Promise<ChatResult> {
      const body: any = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: toGeminiContents(req.messages),
      }
      if (req.tools.length) {
        body.tools = [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }]
      }
      const model = profile.model.replace(/^models\//, '')
      // The key goes in a header, never the URL, so it cannot leak into logs.
      const url = `${base}/v1beta/models/${model}:streamGenerateContent?alt=sse`
      const headers = { 'x-goog-api-key': apiKey ?? '' }
      body.generationConfig = { thinkingConfig: { includeThoughts: true } }
      let res: Response
      try {
        res = await postJson(url, headers, body, req.signal)
      } catch (e: any) {
        // Models without thinking support reject the config: retry plain.
        if (!/thinking|thought/i.test(e?.message ?? '')) throw e
        delete body.generationConfig
        res = await postJson(url, headers, body, req.signal)
      }

      let text = ''
      let thinking = ''
      const toolCalls: ToolCall[] = []
      const usage = { input: 0, output: 0 }
      for await (const data of sseData(res)) {
        let chunk: any
        try {
          chunk = JSON.parse(data)
        } catch {
          continue
        }
        if (chunk.usageMetadata) {
          usage.input = chunk.usageMetadata.promptTokenCount ?? usage.input
          usage.output = chunk.usageMetadata.candidatesTokenCount ?? usage.output
        }
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          if (part.thought) {
            if (part.text) {
              thinking += part.text
              onThinking?.(part.text)
            }
            continue
          }
          if (part.text) {
            text += part.text
            onText(part.text)
          }
          if (part.functionCall) {
            toolCalls.push({
              id: `call_${toolCalls.length}_${Date.now()}`,
              name: part.functionCall.name,
              args: part.functionCall.args ?? {},
              meta: part.thoughtSignature,
            })
          }
        }
      }
      return { text, thinking, toolCalls, usage }
    },
  }
}
