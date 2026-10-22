import type { Item, PreviewDto } from './shared/ipc.js'
import { toolByName, type Preview } from './tools/index.js'
import { collapseContext, diffLines } from './tools/diff.js'
import type { Msg } from './types.js'

const MAX_RESULT = 4000
const MAX_DIFF_LINES = 400

export const clip = (s: string) => (s.length > MAX_RESULT ? s.slice(0, MAX_RESULT) + '\n… (clipped)' : s)

/** Turn saved model messages back into what the chat shows. */
export function toItems(messages: Msg[]): Item[] {
  const results = new Map<string, Extract<Msg, { role: 'tool' }>>()
  for (const m of messages) if (m.role === 'tool') results.set(m.toolCallId, m)

  const items: Item[] = []
  for (const m of messages) {
    if (m.role === 'user') items.push({ kind: 'user', text: m.display ?? m.content })
    else if (m.role === 'assistant') {
      if (m.thinking?.trim()) items.push({ kind: 'thinking', text: m.thinking, done: true })
      if (m.content.trim()) items.push({ kind: 'assistant', text: m.content })
      for (const c of m.toolCalls ?? []) {
        let summary = ''
        try {
          summary = toolByName(c.name)?.summarize(c.args) ?? ''
        } catch {}
        const r = results.get(c.id)
        const status = !r ? 'error' : r.content.startsWith('The user denied') ? 'denied' : r.isError ? 'error' : 'ok'
        items.push({ kind: 'tool', name: c.name, summary, status, result: r ? clip(r.content) : 'Cancelled.' })
      }
    }
  }
  return items
}

export function toPreviewDto(p: Preview): PreviewDto {
  if (p.kind !== 'diff') return p
  const all = diffLines(p.before, p.after)
  const lines = collapseContext(all, 3)
  const added = all.filter((l) => l.type === '+').length
  const removed = all.filter((l) => l.type === '-').length
  return { kind: 'diff', path: p.path, lines: lines.slice(0, MAX_DIFF_LINES), added, removed, more: Math.max(0, lines.length - MAX_DIFF_LINES) }
}
