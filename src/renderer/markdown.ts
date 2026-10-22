import { highlight } from './highlight.js'

/** Small markdown → HTML renderer for chat replies. Everything is escaped first; only known tags are emitted. */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(raw: string): string {
  return raw
    .split(/(`[^`\n]+`)/g)
    .map((part) => {
      if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) return `<code>${esc(part.slice(1, -1))}</code>`
      return esc(part)
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
        .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?![*\w])/g, '$1<em>$2</em>')
        .replace(/(^|[^_\w])_([^_\s][^_\n]*?)_(?![_\w])/g, '$1<em>$2</em>')
    })
    .join('')
}

const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-')
const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    const fence = line.match(/^\s*(```|~~~)\s*([\w+.#-]*)/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++])
      i++ // closing fence (a streaming reply may not have one yet)
      const lang = fence[2]
      out.push(
        `<div class="code"><div class="code-head"><span>${esc(lang)}</span><button class="code-copy" type="button">Copy</button></div><pre><code class="hljs">${highlight(body.join('\n'), lang)}</code></pre></div>`,
      )
      continue
    }

    if (!line.trim()) {
      i++
      continue
    }

    const hd = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (hd) {
      const n = Math.min(hd[1].length + 1, 5)
      out.push(`<h${n}>${inline(hd[2])}</h${n}>`)
      i++
      continue
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>')
      i++
      continue
    }

    if (/^\s*>/.test(line)) {
      const q: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(`<blockquote>${renderMarkdown(q.join('\n'))}</blockquote>`)
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]))
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows
          .map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      )
      continue
    }

    if (LIST.test(line)) {
      const items: { indent: number; ordered: boolean; text: string }[] = []
      while (i < lines.length) {
        const m = lines[i].match(LIST)
        if (m) items.push({ indent: m[1].replace(/\t/g, '  ').length, ordered: /\d/.test(m[2]), text: m[3] })
        else if (items.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i])) items[items.length - 1].text += ' ' + lines[i].trim()
        else break
        i++
      }
      out.push(renderList(items))
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|#{1,6}\s|>)/.test(lines[i]) && !LIST.test(lines[i])) para.push(lines[i++])
    if (!para.length) para.push(lines[i++])
    out.push(`<p>${inline(para.join('\n'))}</p>`)
  }
  return out.join('')
}

function renderList(items: { indent: number; ordered: boolean; text: string }[]): string {
  let html = ''
  const stack: { indent: number; tag: string }[] = []
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1].indent) html += `</li></${stack.pop()!.tag}>`
    const top = stack[stack.length - 1]
    if (!top || it.indent > top.indent) {
      const tag = it.ordered ? 'ol' : 'ul'
      html += `<${tag}><li>`
      stack.push({ indent: it.indent, tag })
    } else html += '</li><li>'
    html += inline(it.text)
  }
  while (stack.length) html += `</li></${stack.pop()!.tag}>`
  return html
}
