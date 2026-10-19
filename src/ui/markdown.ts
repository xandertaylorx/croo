import type { Theme } from './theme.js'

/**
 * Tiny line-based markdown renderer for streamed output.
 * Feed it text with push(); complete lines are rendered as they arrive, flush() emits the rest.
 * With colour disabled it passes text through untouched (so piped output stays plain markdown).
 */
export class MarkdownStream {
  private buf = ''
  private inCode = false

  constructor(
    private theme: Theme,
    private write: (s: string) => void,
  ) {}

  push(delta: string) {
    if (!this.theme.enabled) return this.write(delta)
    this.buf += delta
    let nl: number
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl)
      this.buf = this.buf.slice(nl + 1)
      this.write(this.renderLine(line) + '\n')
    }
  }

  flush() {
    if (this.buf) {
      this.write(this.theme.enabled ? this.renderLine(this.buf) : this.buf)
      this.buf = ''
    }
    this.inCode = false
  }

  /** Whether the last emitted char was mid-line (so callers know to add a newline). */
  get pending() {
    return this.buf.length > 0
  }

  renderLine(line: string): string {
    const t = this.theme
    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/)
    if (fence) {
      this.inCode = !this.inCode
      return this.inCode && fence[1] ? t.muted(`  ▎ ${fence[1]}`) : ''
    }
    if (this.inCode) return `${t.muted('  ▎')} ${t.text(line)}`

    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) return t.bold(t.accent(this.inline(h[2])))
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) return t.muted('─'.repeat(24))
    const q = line.match(/^>\s?(.*)$/)
    if (q) return `${t.muted('▎')} ${t.italic(this.inline(q[1]))}`
    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
    if (li) {
      const bullet = /\d/.test(li[2]) ? t.accent(li[2]) : t.accent('•')
      return `${li[1]}${bullet} ${this.inline(li[3])}`
    }
    return this.inline(line)
  }

  private inline(s: string): string {
    const t = this.theme
    // Split on inline code first so emphasis markers inside code are left alone.
    return s
      .split(/(`[^`]+`)/g)
      .map((part) => {
        if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) return t.accent(part.slice(1, -1))
        return part
          .replace(/\*\*([^*]+)\*\*/g, (_, x) => t.bold(x))
          .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)/g, (_, p, x) => p + t.italic(x))
      })
      .join('')
  }
}
