import type { ProviderType } from './types.js'

/** How hard the model should think. "auto" sends nothing and lets the provider choose. */
export type Effort = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export const EFFORTS: Effort[] = ['auto', 'low', 'medium', 'high', 'xhigh', 'max']
const ORDER: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export interface ClaudeId {
  family: 'opus' | 'sonnet' | 'haiku' | 'fable' | 'mythos'
  /** 4.6 → 4.6, 5 → 5, 5.5 → 5.5. */
  version: number
}

/** Understands claude-opus-4-8, claude-sonnet-5-5, claude-haiku-4-5, claude-sonnet-4-20250514, bedrock/vertex prefixes… */
export function parseClaude(model: string): ClaudeId | null {
  const m = model.toLowerCase().match(/claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?!\d)/)
  if (!m) return null
  return { family: m[1] as ClaudeId['family'], version: Number(m[2]) + (m[3] ? Number(m[3]) / 10 : 0) }
}

/** Which way a Claude model takes its reasoning settings. */
export type ClaudeThinking = 'adaptive' | 'budget' | 'unknown'

/**
 * Claude 4.6 and later think adaptively (`budget_tokens` is rejected on the newest); older models take a token
 * budget. Anything we cannot place is "unknown", and the provider works it out from the API's answer.
 */
export function claudeThinking(model: string): ClaudeThinking {
  const c = parseClaude(model)
  if (!c) return model.toLowerCase().includes('claude') ? 'budget' : 'unknown'
  if (c.family === 'fable' || c.family === 'mythos') return 'adaptive'
  if (c.family === 'haiku') return c.version >= 5 ? 'adaptive' : 'budget'
  return c.version >= 4.6 ? 'adaptive' : 'budget'
}

/** The levels a model accepts, or null when it has no effort setting. */
export function effortLevels(type: ProviderType, model: string): Effort[] | null {
  const id = model.toLowerCase().replace(/^models\//, '').replace(/^[\w-]+\//, '')
  if (type === 'anthropic') {
    const c = parseClaude(model)
    if (!c) return null
    if (c.family === 'fable' || c.family === 'mythos') return ['low', 'medium', 'high', 'xhigh', 'max']
    if (c.family === 'haiku') return c.version >= 5 ? ['low', 'medium', 'high', 'xhigh', 'max'] : null
    if (c.version >= 4.7) return ['low', 'medium', 'high', 'xhigh', 'max']
    if (c.version >= 4.6) return ['low', 'medium', 'high', 'max']
    if (c.family === 'opus' && c.version === 4.5) return ['low', 'medium', 'high']
    return null
  }
  if (type === 'gemini') {
    if (/gemini-3/.test(id)) return ['low', 'high']
    if (/gemini-2\.5/.test(id)) return ['low', 'medium', 'high']
    return null
  }
  // OpenAI and compatibles: reasoning models take reasoning_effort.
  return /^(o\d|gpt-([5-9]|\d\d)|gpt-oss)/.test(id) ? ['low', 'medium', 'high'] : null
}

/** The highest supported level that does not exceed the request (or the lowest one if it is below them all). */
export function clampEffort(want: Effort, levels: Effort[]): Effort | null {
  if (want === 'auto' || !levels.length) return null
  if (levels.includes(want)) return want
  const wanted = ORDER.indexOf(want)
  const below = levels.filter((l) => ORDER.indexOf(l) < wanted)
  return below.length ? below[below.length - 1] : levels[0]
}

/** A token budget for models that think with a fixed budget rather than an effort level. */
export function thinkingBudget(effort: Effort | null, cap: number): number {
  const base = { low: 1500, medium: 4000, high: 10000, xhigh: 16000, max: 24000 }[effort && effort !== 'auto' ? effort : 'medium'] ?? 4000
  return Math.max(1024, Math.min(base, cap - 1024))
}

/** Gemini 2.5 thinking budgets. */
export const GEMINI_BUDGET: Record<'low' | 'medium' | 'high', number> = { low: 1024, medium: 8192, high: 24576 }

/** Output limits differ a lot between generations; thinking models need room for the reasoning too. */
export function claudeMaxTokens(model: string): number {
  return /claude-3/.test(model.toLowerCase()) ? 8192 : 32000
}
