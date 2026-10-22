import { parseClaude } from './effort.js'
import { isLocalUrl } from './config.js'
import type { Profile } from './types.js'

/** US dollars per million tokens. */
export interface Price {
  input: number
  output: number
  source: 'built-in' | 'custom' | 'local'
}

/** Claude list prices (standard, no caching or long-context surcharge). Other providers: set your own in Settings. */
function claudePrice(model: string): { input: number; output: number } | null {
  const c = parseClaude(model)
  if (!c) return null
  const v = c.version
  if (c.family === 'fable' || c.family === 'mythos') return { input: 10, output: 50 }
  if (c.family === 'opus') {
    if (v >= 5.5) return { input: 4, output: 20 }
    if (v >= 4.5) return { input: 5, output: 25 }
    return { input: 15, output: 75 }
  }
  if (c.family === 'sonnet') return v >= 5 ? { input: 2, output: 10 } : { input: 3, output: 15 }
  return v >= 5 ? { input: 0.1, output: 0.5 } : { input: 1, output: 5 }
}

/** What a model costs: your own numbers if you set them, free for a local server, a built-in Claude price, or unknown. */
export function priceFor(p: Pick<Profile, 'type' | 'model' | 'baseUrl' | 'inputPerMTok' | 'outputPerMTok'>): Price | null {
  if (p.inputPerMTok !== undefined || p.outputPerMTok !== undefined) return { input: p.inputPerMTok ?? 0, output: p.outputPerMTok ?? 0, source: 'custom' }
  if (isLocalUrl(p.baseUrl)) return { input: 0, output: 0, source: 'local' }
  if (p.type === 'anthropic') {
    const c = claudePrice(p.model)
    if (c) return { ...c, source: 'built-in' }
  }
  return null
}

export { costOf, formatCost } from './cost.js'
