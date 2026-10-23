import type { ProviderType } from '../types.js'

export interface Preset {
  id: string
  label: string
  type: ProviderType
  baseUrl?: string
  model: string
  /** Local servers need no key. */
  noKey?: boolean
  /** Signs in through the provider's own CLI with a subscription, not an API key. */
  subscription?: boolean
}

export const PRESETS: Preset[] = [
  { id: 'claude-code', label: 'Claude subscription', type: 'claude-code', model: 'claude-sonnet-5-5', noKey: true, subscription: true },
  { id: 'codex', label: 'ChatGPT subscription', type: 'codex', model: 'gpt-6.1-sol', noKey: true, subscription: true },
  { id: 'openai', label: 'OpenAI', type: 'openai', model: 'gpt-4o' },
  { id: 'anthropic', label: 'Anthropic (Claude)', type: 'anthropic', model: 'claude-sonnet-4-5' },
  { id: 'gemini', label: 'Google Gemini', type: 'gemini', model: 'gemini-2.5-pro' },
  { id: 'groq', label: 'Groq', type: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { id: 'openrouter', label: 'OpenRouter', type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-4.5' },
  { id: 'deepseek', label: 'DeepSeek', type: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'xai', label: 'xAI (Grok)', type: 'openai', baseUrl: 'https://api.x.ai/v1', model: 'grok-4' },
  { id: 'mistral', label: 'Mistral', type: 'openai', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' },
  { id: 'together', label: 'Together AI', type: 'openai', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  { id: 'ollama', label: 'Ollama (local, no key)', type: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', noKey: true },
]
