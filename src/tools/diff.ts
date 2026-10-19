export interface DiffLine {
  type: ' ' | '+' | '-'
  text: string
  oldNo?: number
  newNo?: number
}

const MAX_MIDDLE = 2000

/** Line diff: trims common head/tail, then LCS on the middle (capped for huge edits). */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  const am = a.slice(head, a.length - tail)
  const bm = b.slice(head, b.length - tail)

  const ops: DiffLine[] = []
  let oldNo = 1
  let newNo = 1
  for (let i = 0; i < head; i++) ops.push({ type: ' ', text: a[i], oldNo: oldNo++, newNo: newNo++ })

  if (am.length > MAX_MIDDLE || bm.length > MAX_MIDDLE) {
    for (const t of am) ops.push({ type: '-', text: t, oldNo: oldNo++ })
    for (const t of bm) ops.push({ type: '+', text: t, newNo: newNo++ })
  } else {
    const n = am.length
    const m = bm.length
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        dp[i][j] = am[i] === bm[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && am[i] === bm[j]) {
        ops.push({ type: ' ', text: am[i], oldNo: oldNo++, newNo: newNo++ })
        i++
        j++
      } else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) {
        ops.push({ type: '-', text: am[i++], oldNo: oldNo++ })
      } else {
        ops.push({ type: '+', text: bm[j++], newNo: newNo++ })
      }
    }
  }
  for (let i = a.length - tail; i < a.length; i++) ops.push({ type: ' ', text: a[i], oldNo: oldNo++, newNo: newNo++ })
  return ops
}

/** Keep changed lines plus `context` lines around them; `null` marks a skipped gap. */
export function collapseContext(lines: DiffLine[], context = 2): (DiffLine | null)[] {
  const keep = new Array(lines.length).fill(false)
  lines.forEach((l, i) => {
    if (l.type === ' ') return
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true
  })
  const out: (DiffLine | null)[] = []
  let gap = false
  lines.forEach((l, i) => {
    if (keep[i]) {
      out.push(l)
      gap = false
    } else if (!gap) {
      out.push(null)
      gap = true
    }
  })
  return out
}
