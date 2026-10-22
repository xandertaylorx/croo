export interface DiffRow {
  type: 'add' | 'del' | 'ctx' | 'hunk'
  text: string
  /** Line number shown in the gutter (new for added/context lines, old for removed ones). */
  no?: number
}

/** Turn `git diff` output into rows. The file header lines before the first hunk are skipped. */
export function parseDiff(diff: string): { rows: DiffRow[]; binary: boolean } {
  const rows: DiffRow[] = []
  let oldNo = 0
  let newNo = 0
  let inHunk = false
  const binary = /^Binary files .* differ$/m.test(diff) || /^GIT binary patch/m.test(diff)
  for (const line of diff.split('\n')) {
    const h = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@\s?(.*)$/)
    if (h) {
      inHunk = true
      oldNo = Number(h[1])
      newNo = Number(h[2])
      rows.push({ type: 'hunk', text: h[3] ? `${h[3]}` : '' })
      continue
    }
    if (!inHunk || line.startsWith('\\')) continue
    if (line.startsWith('+')) rows.push({ type: 'add', text: line.slice(1), no: newNo++ })
    else if (line.startsWith('-')) rows.push({ type: 'del', text: line.slice(1), no: oldNo++ })
    else if (line.startsWith(' ')) {
      rows.push({ type: 'ctx', text: line.slice(1), no: newNo++ })
      oldNo++
    }
  }
  return { rows, binary }
}

/** One word for what happened to a file, from the two status letters. */
export function statusLabel(index: string, work: string): { letter: string; word: string } {
  if (index === '?' && work === '?') return { letter: 'U', word: 'New' }
  const c = work.trim() || index.trim()
  if (index === 'U' || work === 'U' || (index === 'A' && work === 'A') || (index === 'D' && work === 'D')) return { letter: '!', word: 'Conflict' }
  return ({ A: { letter: 'A', word: 'Added' }, D: { letter: 'D', word: 'Deleted' }, R: { letter: 'R', word: 'Renamed' }, C: { letter: 'C', word: 'Copied' }, M: { letter: 'M', word: 'Modified' } } as const)[c as 'A'] ?? { letter: 'M', word: 'Modified' }
}
