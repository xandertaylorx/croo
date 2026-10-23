import { DEFAULT_BASE_URLS, resolveApiKey } from '../config.js'
import type { Profile } from '../types.js'
import { detect, isSubscription, subscriptionModels } from '../subscriptions/index.js'

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
  if (isSubscription(profile.type)) return { model: profile.model, error: (await detect(profile.type)).problem }
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

export interface ModelInfo {
  id: string
  /** Friendly name when the provider gives one. */
  name?: string
}

/** The chat models this key can use, newest first where the provider says so. */
export async function listModels(profile: Profile): Promise<{ models: ModelInfo[]; error?: string }> {
  // A subscription has no models endpoint: the bundled list (plus the user's models.json) is the list.
  if (isSubscription(profile.type)) return { models: subscriptionModels(profile.type).filter((m) => m.status === 'current' || m.id === profile.model).map((m) => ({ id: m.id, name: m.name })) }
  const key = resolveApiKey(profile)
  const signal = AbortSignal.timeout(8000)
  try {
    if (profile.type === 'anthropic') {
      const base = (profile.baseUrl ?? DEFAULT_BASE_URLS.anthropic).replace(/\/+$/, '')
      const res = await fetch(`${base}/v1/models?limit=100`, { headers: { 'x-api-key': key ?? '', 'anthropic-version': '2023-06-01' }, signal })
      if (!res.ok) return { models: [], error: res.status === 401 ? 'That key was rejected.' : `The provider answered ${res.status}.` }
      const data = ((await res.json()) as any).data ?? []
      return { models: data.map((m: any) => ({ id: m.id, name: m.display_name })) }
    }
    if (profile.type === 'gemini') {
      const base = (profile.baseUrl ?? DEFAULT_BASE_URLS.gemini).replace(/\/+$/, '')
      const res = await fetch(`${base}/v1beta/models?pageSize=200`, { headers: { 'x-goog-api-key': key ?? '' }, signal })
      if (!res.ok) return { models: [], error: [400, 401, 403].includes(res.status) ? 'That key was rejected.' : `The provider answered ${res.status}.` }
      const data = ((await res.json()) as any).models ?? []
      return {
        models: data
          .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent') && !NOT_CHAT.test(m.name))
          .map((m: any) => ({ id: String(m.name).replace(/^models\//, ''), name: m.displayName })),
      }
    }
    const base = (profile.baseUrl ?? DEFAULT_BASE_URLS.openai).replace(/\/+$/, '')
    const res = await fetch(`${base}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {}, signal })
    if (!res.ok) return { models: [], error: res.status === 401 ? 'That key was rejected.' : `The provider answered ${res.status}.` }
    const json: any = await res.json()
    const data: any[] = json.data ?? json.models ?? []
    return {
      models: data
        .filter((m) => !NOT_CHAT.test(m.id ?? m.name ?? ''))
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || String(a.id).localeCompare(String(b.id)))
        .map((m) => ({ id: m.id ?? m.name, name: m.name && m.name !== m.id ? m.name : undefined })),
    }
  } catch {
    return { models: [], error: "Couldn't reach the provider." }
  }
}
