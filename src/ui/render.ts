import type { Theme } from './theme.js'
import { visibleLength } from './theme.js'
import type { Pet, PetState } from './pet.js'
import { MarkdownStream } from './markdown.js'
import { Spinner, THINKING_VERBS, TOOL_VERBS } from './spinner.js'
import { columns, hideCursor, isTTY, shortenPath, showCursor, truncateMiddle } from './term.js'
import { collapseContext, diffLines } from '../tools/diff.js'
import type { Preview } from '../tools/index.js'

export interface UiOptions {
  theme: Theme
  pet: Pet
  showPet: boolean
  animations: boolean
  /** Ask a single-line question; resolves '' when no input is possible (non-TTY). */
  ask: (prompt: string) => Promise<string>
}

export interface BannerInfo {
  version: string
  profile: string
  model: string
  cwd: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

export class Ui {
  readonly spinner: Spinner
  private md: MarkdownStream
  private midLine = false // streamed text without trailing newline
  private streamed = false
  readonly animate: boolean

  constructor(private o: UiOptions) {
    this.animate = isTTY && o.animations
    this.spinner = new Spinner({ theme: o.theme, enabled: this.animate, pet: o.pet, showPet: o.showPet })
    this.md = new MarkdownStream(o.theme, (s) => {
      process.stdout.write(s)
      this.midLine = !s.endsWith('\n')
    })
  }

  get t() {
    return this.o.theme
  }

  // ---------- banner ----------

  async banner(info: BannerInfo) {
    const { t, o } = this
    const cols = columns()
    const hint = t.muted('/help for commands')
    if (!o.showPet || cols < 60) {
      console.log(`${t.accent(t.bold('Croo'))} ${t.muted('v' + info.version)}  ${t.muted(`${info.model} · ${info.profile}`)}`)
      console.log(t.muted(truncateMiddle(shortenPath(info.cwd), cols - 2)))
      console.log(hint + '\n')
      return
    }
    const say = o.pet.sayings[Math.floor(Math.random() * o.pet.sayings.length)]
    const right = [
      t.muted(`“${say}”`),
      `${t.accent(t.bold('Croo'))} ${t.muted('v' + info.version)}`,
      t.muted(`${info.model} · ${info.profile}`),
      t.muted(truncateMiddle(shortenPath(info.cwd), cols - 20)),
    ]
    const compose = (frame: string[]) => frame.map((l, i) => `${t.accent(l)}   ${right[i] ?? ''}`)
    const frames = o.pet.frames.idle
    let lines = compose(frames[0])
    console.log(lines.join('\n'))
    console.log(' '.repeat(14) + hint + '\n')
    if (!this.animate) return
    // A short intro: one blink, then the frog sits still (animating at the prompt would fight readline).
    const redraw = (frame: string[]) => {
      const up = lines.length + 2
      process.stdout.write(`\x1b[${up}A` + compose(frame).map((l) => `\r\x1b[2K${l}\n`).join('') + `\x1b[2B`)
    }
    hideCursor()
    try {
      await sleep(550)
      redraw(frames[1])
      await sleep(140)
      redraw(frames[0])
    } finally {
      showCursor()
    }
  }

  // ---------- streaming ----------

  think(verbs = THINKING_VERBS) {
    this.spinner.start('thinking', verbs)
  }

  work(tool: string, detail: string) {
    this.spinner.start('working', [TOOL_VERBS[tool] ?? 'Working'], detail)
  }

  idle() {
    this.spinner.stop()
  }

  text(delta: string) {
    this.spinner.stop()
    if (!this.streamed) {
      this.streamed = true
      if (this.animate || this.t.enabled) process.stdout.write('\n')
    }
    this.spinner.tokens += Math.ceil(delta.length / 4)
    this.md.push(delta)
  }

  endText() {
    this.spinner.stop()
    this.md.flush()
    if (this.midLine) process.stdout.write('\n')
    this.midLine = false
    this.streamed = false
  }

  /** Reset per-turn counters. */
  beginTurn() {
    this.spinner.tokens = 0
    this.streamed = false
  }

  // ---------- messages ----------

  line(s = '') {
    this.spinner.stop()
    if (this.midLine) process.stdout.write('\n'), (this.midLine = false)
    console.log(s)
  }

  info(s: string) {
    this.line(this.t.muted(s))
  }

  warn(s: string) {
    this.line(this.t.warn(s))
  }

  error(s: string) {
    const mini = this.o.showPet ? this.o.pet.mini.oops[0] + ' ' : ''
    this.line(this.t.error(`${mini}${s}`))
  }

  done(seconds: number) {
    if (!this.animate && !this.t.enabled) return // keep piped output clean
    const mini = this.o.showPet ? this.o.pet.mini.happy[0] + ' ' : ''
    this.line(this.t.muted(`${mini}done in ${seconds.toFixed(1)}s`))
  }

  /** Full-size pet reaction, used for startup problems. Plain text when narrow or piped. */
  petSays(state: PetState, message: string) {
    const { t, o } = this
    if (!o.showPet || !this.animate || columns() < 60) return console.error(t.error(message))
    const frame = o.pet.frames[state][0]
    const color = state === 'oops' ? t.error : t.accent
    frame.forEach((l, i) => console.error(`${color(l)}   ${i === 1 ? (state === 'oops' ? t.error(message) : message) : ''}`))
  }

  toolCard(name: string, summary: string, ok: boolean, result: string) {
    const { t } = this
    const icon = { read_file: '◇', list_files: '⌕', grep: '⌕', write_file: '✎', edit_file: '✎', bash: '$' }[name] ?? '◆'
    const status = ok ? t.accent('✓') : t.error('✗')
    const room = Math.max(20, columns() - 6 - name.length)
    const first = result.split('\n')[0]
    const tail = first && first !== '(no output)' ? t.muted(` · ${truncateMiddle(first, 40)}`) : ''
    const head = `  ${t.accent(icon)} ${t.bold(name)} ${t.muted(truncateMiddle(summary.replace(/\s+/g, ' '), room - 45))}`
    this.line(`${head} ${status}${ok ? '' : tail}`)
  }

  // ---------- permission prompt ----------

  async confirm(name: string, preview: Preview): Promise<'y' | 'n' | 'a'> {
    const { t } = this
    const w = Math.min(columns() - 2, 100)
    const title = preview.kind === 'diff' ? `${name} ${preview.path}` : `${name}`
    const top = `╭─ ${title} `
    this.line('\n' + t.warn(top + '─'.repeat(Math.max(0, w - visibleLength(top)))))
    const bar = t.warn('│')
    if (preview.kind === 'command') {
      for (const l of preview.command.split('\n').slice(0, 20)) this.line(`${bar} ${t.bold(truncateMiddle(l, w - 4))}`)
    } else {
      this.printDiff(preview.before, preview.after, bar, w - 4)
    }
    const answer = await this.o.ask(`${t.warn('╰')} Allow? ${t.muted('[y]es / [n]o / [a]lways')} `)
    const c = answer.trim().toLowerCase()[0]
    return c === 'y' ? 'y' : c === 'a' ? 'a' : 'n'
  }

  private printDiff(before: string, after: string, bar: string, width: number) {
    const { t } = this
    const rows = collapseContext(diffLines(before, after), 2)
    const numW = String(Math.max(before.split('\n').length, after.split('\n').length)).length
    const MAX = 60
    let shown = 0
    for (const r of rows) {
      if (shown >= MAX) {
        this.line(`${bar} ${t.muted(`… ${rows.length - shown} more lines`)}`)
        break
      }
      shown++
      if (r === null) {
        this.line(`${bar} ${t.muted('…')}`)
        continue
      }
      const no = String(r.type === '-' ? r.oldNo : r.newNo).padStart(numW)
      const body = truncateMiddle(r.text, Math.max(10, width - numW - 4))
      if (r.type === '+') this.line(`${bar} ${t.accent(`${no} + ${body}`)}`)
      else if (r.type === '-') this.line(`${bar} ${t.error(`${no} - ${body}`)}`)
      else this.line(`${bar} ${t.muted(`${no}   ${body}`)}`)
    }
  }

  // ---------- status ----------

  statusLine(s: { model: string; cwd: string; input: number; output: number; cost?: number }) {
    const { t } = this
    const tokens = s.input + s.output > 0 ? ` · ${fmtTokens(s.input)} in / ${fmtTokens(s.output)} out` : ''
    const cost = s.cost !== undefined ? ` · ~$${s.cost.toFixed(s.cost < 0.1 ? 3 : 2)}` : ''
    const text = `${s.model} · ${shortenPath(s.cwd)}${tokens}${cost}`
    this.line(t.muted('  ' + truncateMiddle(text, columns() - 3)))
  }
}
