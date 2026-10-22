import fs from 'node:fs'
import path from 'node:path'
import type { AttachedFile } from './types.js'
import { safePath } from './tools/index.js'
import { walk } from './tools/ignore.js'

const MAX_FILE = 200_000
const MAX_TOTAL = 500_000

/** `@src/app.ts` anywhere a mention can start: beginning of the text or after whitespace. */
const MENTION = /(^|\s)@([\w./\\-][\w./\\ -]*?)(?=[\s,;:!?)]|$)/g

export function fileBlock(f: AttachedFile): string {
  return `\n\n<attached_file name="${f.name.replace(/"/g, "'")}">\n${f.text}\n</attached_file>`
}

/** Text files named with @ in the message, read from the folder. Missing, binary or oversized files are skipped. */
export function expandMentions(text: string, cwd: string): AttachedFile[] {
  const found: AttachedFile[] = []
  const seen = new Set<string>()
  let total = 0
  for (const m of text.matchAll(MENTION)) {
    const rel = m[2].replace(/\\/g, '/')
    if (seen.has(rel)) continue
    seen.add(rel)
    try {
      const abs = safePath(cwd, rel)
      const stat = fs.statSync(abs)
      if (!stat.isFile() || stat.size > MAX_FILE || total + stat.size > MAX_TOTAL) continue
      const buf = fs.readFileSync(abs)
      if (buf.subarray(0, 8000).includes(0)) continue
      total += buf.length
      found.push({ name: rel, text: buf.toString('utf8') })
    } catch {}
  }
  return found
}

/** Rank a path against what was typed: filename prefix, filename contains, path contains, then in-order letters. */
export function scorePath(rel: string, query: string): number {
  const q = query.toLowerCase()
  if (!q) return 1
  const lower = rel.toLowerCase()
  const base = lower.slice(lower.lastIndexOf('/') + 1)
  if (base === q) return 100
  if (base.startsWith(q)) return 80 - Math.min(rel.length / 10, 20)
  if (base.includes(q)) return 60 - Math.min(rel.length / 10, 20)
  if (lower.includes(q)) return 40 - Math.min(rel.length / 10, 20)
  let i = 0
  for (const ch of lower) if (ch === q[i]) i++
  return i === q.length ? 10 : 0
}

/** Files in the folder (respecting .gitignore) that match, best first. An empty query lists shallow files. */
export function searchFiles(cwd: string, query: string, limit = 20): string[] {
  const root = fs.realpathSync(cwd)
  const scored: [number, string][] = []
  for (const rel of walk(root, root, undefined, { n: 8000 })) {
    const s = scorePath(rel, query.trim())
    if (s > 0) scored.push([query.trim() ? s : 1000 - rel.split('/').length * 10 - rel.length / 100, rel])
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1])).slice(0, limit).map(([, r]) => r)
}

export const baseName = (rel: string) => path.posix.basename(rel)
