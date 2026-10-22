import type { Session, SessionMeta } from './session.js'

export interface ChatHit {
  id: string
  title: string
  cwd: string
  kind: 'chat' | 'code'
  /** A short piece of the conversation around the match, when the match was in the body. */
  snippet?: string
  updatedAt: string
}

const cache = new Map<string, { updatedAt: string; text: string }>()

function textOf(s: Session): string {
  const parts: string[] = []
  for (const m of s.messages) {
    if (m.role === 'user') parts.push(m.display ?? m.content)
    else if (m.role === 'assistant') parts.push(m.content)
  }
  return parts.join('\n').slice(0, 300_000)
}

/** Search chat titles first, then what was said. Bodies are read once and remembered until the chat changes. */
export function searchChats(metas: SessionMeta[], query: string, load: (id: string) => Session | null, limit = 20): ChatHit[] {
  const q = query.trim().toLowerCase()
  const hits: (ChatHit & { score: number })[] = []
  for (const m of metas) {
    const title = m.title.toLowerCase()
    let score = 0
    let snippet: string | undefined
    if (!q) score = 1
    else {
      if (title.includes(q)) score += title.startsWith(q) ? 5 : 3
      let entry = cache.get(m.id)
      if (!entry || entry.updatedAt !== m.updatedAt) {
        const s = load(m.id)
        entry = { updatedAt: m.updatedAt, text: s ? textOf(s) : '' }
        cache.set(m.id, entry)
      }
      const at = entry.text.toLowerCase().indexOf(q)
      if (at >= 0) {
        score += 1
        const from = Math.max(0, at - 40)
        snippet = (from > 0 ? '…' : '') + entry.text.slice(from, at + q.length + 70).replace(/\s+/g, ' ').trim() + '…'
      }
    }
    if (score > 0) hits.push({ id: m.id, title: m.title, cwd: m.cwd, kind: m.kind, snippet, updatedAt: m.updatedAt, score })
  }
  return hits
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map(({ score: _s, ...h }) => h)
}
