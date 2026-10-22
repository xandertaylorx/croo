/** Pure cost helpers, shared by the app and the renderer. US dollars per million tokens. */
export const costOf = (tokens: { input: number; output: number }, price: { input: number; output: number }) => (tokens.input * price.input + tokens.output * price.output) / 1e6

export function formatCost(usd: number): string {
  if (usd <= 0) return '$0'
  if (usd < 0.01) return '<$0.01'
  return usd < 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(usd < 10 ? 2 : 1)}`
}
