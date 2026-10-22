import type { Item } from './shared/ipc.js'

export interface ExportMeta {
  title: string
  /** Folder the chat ran in (Code mode). */
  folder?: string
  model?: string
  date?: Date
}

/** A chat as readable markdown: your messages, Croo's replies, and a quote line for each thing it did. */
export function chatToMarkdown(items: Item[], meta: ExportMeta): string {
  const out: string[] = [`# ${meta.title}`, '']
  const facts = [`Exported ${(meta.date ?? new Date()).toISOString().slice(0, 10)}`, meta.folder ? `Folder: \`${meta.folder}\`` : '', meta.model ? `Model: ${meta.model}` : ''].filter(Boolean)
  out.push(`*${facts.join(' · ')}*`, '')
  for (const it of items) {
    if (it.kind === 'user') {
      out.push('## You', '', it.text.trim(), '')
      if (it.attachments?.length) out.push(`*Attached: ${it.attachments.map((a) => a.name).join(', ')}*`, '')
    } else if (it.kind === 'assistant') {
      if (it.text.trim()) out.push('## Croo', '', it.text.trim(), '')
    } else if (it.kind === 'tool') {
      out.push(`> **${it.name}** ${it.summary}${it.status === 'error' ? ' *(failed)*' : it.status === 'denied' ? ' *(denied)*' : ''}`, '')
    } else if (it.kind === 'error') {
      out.push(`> **Error:** ${it.text}`, '')
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

export const exportName = (title: string) => (title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'chat') + '.md'
