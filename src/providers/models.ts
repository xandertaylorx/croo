import { DEFAULT_BASE_URLS, resolveApiKey } from '../config.js'
import type { Profile } from '../types.js'

export interface ProfileCheck {
  model: string
  /** Set when the provider rejected the key or a local server is not reachable. */
  error?: string
}

const NOT_CHAT = /whisper|tts|guard|embed|moderation|image|dall|audio|transcri|rerank/i

/**
 * Ask the provider about this key before saving it: catches a wrong key right away, and for
 * OpenAI-compatible APIs falls back to an available chat model when the default isn't offered.
 * Network failures to a hosted provider are not treated as errors (you may just be offline).
 */
export async function checkProfile(profile: Profile): Promise<ProfileCheck> {
  const key = resolveApiKey(profile)
  const timeout = AbortSignal.timeout(6000)
  try {
    if (profile.type === 'anthropic') {
      const res = await fetch(`${(profile.baseUrl ?? DEFAULT_BASE_URLS.anthropic).replace(/\/+$/, '')}/v1/models`, {
        headers: { 'x-api-key': key ?? '', 'anthropic-version': '2023-06-01' },
        signal: timeout,
      })
      return { model: profile.model, error: res.status === 401 || res.status === 403 ? 'That key was rejected.' : undefined }
    }
    if (profile.type === 'gemini') {
      const res = await fetch(`${(profile.baseUrl ?? DEFAULT_BASE_URLS.gemini).replace(/\/+$/, '')}/v1beta/models?key=${encodeURIComponent(key ?? '')}`, { signal: timeout })
      return { model: profile.model, error: [400, 401, 403].includes(res.status) ? 'That key was rejected.' : undefined }
    }
    const base = (profile.baseUrl ?? DEFAULT_BASE_URLS.openai).replace(/\/+$/, '')
    const res = await fetch(`${base}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {}, signal: timeout })
    if (res.status === 401 || res.status === 403) return { model: profile.model, error: 'That key was rejected.' }
    if (!res.ok) return { model: profile.model }
    const ids: string[] = ((await res.json()) as any).data?.map((m: any) => m.id) ?? []
    if (!ids.length || ids.includes(profile.model)) return { model: profile.model }
    const chat = ids.filter((id) => !NOT_CHAT.test(id))
    const pick = chat.find((id) => /gpt-oss-120b|llama-3\.3-70b|gpt-4o|large|chat/i.test(id)) ?? chat[0]
    return { model: pick ?? profile.model }
  } catch {
    return { model: profile.model }
  }
}
