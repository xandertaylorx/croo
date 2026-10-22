import type { Profile, Provider } from '../types.js'
import { isLocalUrl, resolveApiKey } from '../config.js'
import { anthropicProvider } from './anthropic.js'
import { geminiProvider } from './gemini.js'
import { openaiProvider } from './openai.js'
import { responsesProvider, usesResponses } from './responses.js'

export function createProvider(profile: Profile, env: NodeJS.ProcessEnv = process.env): Provider {
  const key = resolveApiKey(profile, env)
  // Local OpenAI-compatible servers (Ollama, LM Studio, ...) usually need no key.
  if (!key && !(profile.type === 'openai' && isLocalUrl(profile.baseUrl))) {
    throw new Error(`No API key for this profile. Set one in the config or via CROO_API_KEY / ${profile.type.toUpperCase()}_API_KEY.`)
  }
  if (profile.type === 'anthropic') return anthropicProvider(profile, key)
  if (profile.type === 'gemini') return geminiProvider(profile, key)
  if (usesResponses(profile.baseUrl)) return responsesProvider(profile, key)
  return openaiProvider(profile, key)
}
