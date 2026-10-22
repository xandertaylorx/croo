/** Pure cost helpers, shared by the app and the renderer. US dollars per million tokens. */
/** Cache reads cost a tenth of the input price and cache writes a quarter more (Anthropic's rates; close enough elsewhere). */
export const costOf = (tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number }, price: { input: number; output: number }) =>
  ((tokens.input + (tokens.cacheRead ?? 0) * 0.1 + (tokens.cacheWrite ?? 0) * 1.25) * price.input + tokens.output * price.output) / 1e6

export function formatCost(usd: number): string {
  if (usd <= 0) return '$0'
  if (usd < 0.01) return '<$0.01'
  return usd < 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(usd < 10 ? 2 : 1)}`
}
