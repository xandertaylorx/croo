import { highlight } from './highlight.js'
import katex from 'katex'
import { runKind } from './run.js'
import { renderChart } from './chart.js'

/** Small markdown → HTML renderer for chat replies. Everything is escaped first; only known tags are emitted. */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\w$])/g

function tex(src: string, display: boolean): string {
  try {
    return katex.renderToString(src.trim(), { displayMode: display, throwOnError: false, output: 'html', trust: false, strict: 'ignore' })
  } catch {
    return `<code>${esc(src)}</code>`
  }
}

function inline(raw: string): string {
  // Code spans are set aside first so nothing inside them is touched, and so **`bold code`** still pairs up.
  const code: string[] = []
  let part = raw.replace(/`([^`\n]+)`/g, (_all, c) => `\uE002${code.push(`<code>${esc(c)}</code>`) - 1}\uE003`)
  // Math is set aside next so markdown (underscores, asterisks) never touches the formulas.
  const math: string[] = []
  part = part.replace(MATH, (_all, a, b, c, d) => {
    const display = a !== undefined || b !== undefined
    math.push(tex(a ?? b ?? c ?? d, display))
    return `\uE000${math.length - 1}\uE001`
  })
  return esc(part)
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?![*\w])/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_\n]*?)_(?![_\w])/g, '$1<em>$2</em>')
    // Bare web addresses become links (the ones already inside an href follow a quote, so they are not matched).
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]*[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>')
    .replace(/\uE000(\d+)\uE001/g, (_m, n) => math[Number(n)])
    .replace(/\uE002(\d+)\uE003/g, (_m, n) => code[Number(n)])
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
      const closed = i < lines.length
      i++ // closing fence (a streaming reply may not have one yet)
      const lang = fence[2]
      if (lang === 'chart') {
        const svg = renderChart(body.join('\n'))
        if (svg) {
          out.push(svg)
          continue
        }
        // Half-written JSON while the reply streams: wait quietly; if the fence closed and it still is not a chart, show it as code.
        if (!closed) {
          out.push('<div class="chart-wait">Drawing chart…</div>')
          continue
        }
      }
      const kind = runKind(lang)
      const run = kind
        ? `<button class="code-run" type="button" data-kind="${kind}"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg><span>Run</span></button>`
        : ''
      out.push(
        `<div class="code"><div class="code-head"><span>${esc(lang)}</span><span class="code-actions">${run}<button class="code-copy" type="button">Copy</button></span></div><pre><code class="hljs">${highlight(body.join('\n'), lang)}</code></pre></div>`,
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
    const task = it.text.match(/^\[( |x|X)\]\s+(.*)$/)
    const open = task ? `<li class="task${task[1] === ' ' ? '' : ' done'}"><span class="box" aria-hidden="true"></span>` : '<li>'
    if (!top || it.indent > top.indent) {
      const tag = it.ordered ? 'ol' : 'ul'
      html += `<${tag}>${open}`
      stack.push({ indent: it.indent, tag })
    } else html += `</li>${open}`
    html += inline(task ? task[2] : it.text)
  }
  while (stack.length) html += `</li></${stack.pop()!.tag}>`
  return html
}
