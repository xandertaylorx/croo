/** Fetching a web page for the model: HTML is turned into readable text, other text is passed through. */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', copy: '©' }

const decode = (s: string) =>
  s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })

/** A rough HTML-to-markdown pass: enough structure (headings, lists, links, code) for a model to read. */
export function htmlToText(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
  let s = html.replace(/<!--[\s\S]*?-->/g, '')
  // Prefer the main content when the page marks it.
  const main = s.match(/<(main|article)\b[\s\S]*?<\/\1>/i)?.[0]
  if (main && main.length > 500) s = main
  s = s
    .replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer|form)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_m, code: string) => `\n\`\`\`\n${code.replace(/<[^>]+>/g, '')}\n\`\`\`\n`)
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, code: string) => `\`${code.replace(/<[^>]+>/g, '')}\``)
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n: string, t: string) => `\n\n${'#'.repeat(Number(n))} ${t.replace(/<[^>]+>/g, '').trim()}\n\n`)
    .replace(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, t: string) => {
      const text = t.replace(/<[^>]+>/g, '').trim()
      return text ? `[${text}](${href})` : ''
    })
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|section|tr|table|ul|ol|blockquote|li|dd|dt)>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
  s = decode(s)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return title ? `# ${decode(title)}\n\n${s}` : s
}

export async function fetchPage(url: string, signal?: AbortSignal): Promise<string> {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error(`Not a valid URL: ${url}`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http and https URLs can be fetched.')
  const timeout = AbortSignal.timeout(30_000)
  const res = await fetch(u, {
    redirect: 'follow',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; Croo coding agent)', accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5' },
  })
  const type = res.headers.get('content-type') ?? ''
  const head = `${res.status} ${res.statusText} · ${res.url}${res.url !== u.href ? ' (redirected)' : ''}`
  if (!/^text\/|json|xml|javascript/.test(type) && type) return `${head}\nNot a text page (${type}).`
  const body = await res.text()
  const text = /html/.test(type) || /^\s*<(!doctype html|html)/i.test(body) ? htmlToText(body) : body
  return `${head}\n\n${text || '(empty page)'}`
}
