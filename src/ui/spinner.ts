import type { Theme } from './theme.js'
import type { Pet, PetState } from './pet.js'
import { columns, hideCursor, showCursor, truncateMiddle } from './term.js'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export const THINKING_VERBS = ['Thinking', 'Hatching a plan', 'Pondering', 'Ribbiting', 'Mulling it over', 'Hopping to conclusions']
export const TOOL_VERBS: Record<string, string> = {
  read_file: 'Reading',
  list_files: 'Looking around',
  grep: 'Searching',
  write_file: 'Writing',
  edit_file: 'Editing',
  bash: 'Running',
}

export interface SpinnerOptions {
  theme: Theme
  enabled: boolean // animations + TTY
  pet: Pet
  showPet: boolean
}

/**
 * One-line spinner: `⠋ (o.o) Thinking… 3s · 120 tokens`.
 * Redraws one line in place; never prints while paused, so streamed text is not disturbed.
 */
export class Spinner {
  private timer?: NodeJS.Timeout
  private startedAt = 0
  private tick = 0
  private verbs: string[] = THINKING_VERBS
  private state: PetState = 'thinking'
  private detail = ''
  tokens = 0

  constructor(private o: SpinnerOptions) {}

  get active() {
    return !!this.timer
  }

  start(state: PetState, verbs: string[], detail = '') {
    this.stop()
    if (!this.o.enabled) return
    this.state = state
    this.verbs = verbs
    this.detail = detail
    this.startedAt = Date.now()
    this.tick = 0
    hideCursor()
    this.render()
    this.timer = setInterval(() => this.render(), 120)
  }

  stop() {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = undefined
    process.stdout.write('\r\x1b[2K')
    showCursor()
  }

  private render() {
    const { theme: t, pet, showPet } = this.o
    const secs = Math.floor((Date.now() - this.startedAt) / 1000)
    const verb = this.verbs[Math.floor(this.tick / 25) % this.verbs.length]
    const mini = pet.mini[this.state]
    const glyph = showPet ? t.accent(mini[Math.floor(this.tick / 4) % mini.length]) + ' ' : ''
    const stats = [`${secs}s`, this.tokens ? `~${this.tokens} tokens` : ''].filter(Boolean).join(' · ')
    const label = `${verb}…${this.detail ? ' ' + this.detail : ''}`
    const head = `${t.accent(FRAMES[this.tick % FRAMES.length])} ${glyph}`
    const room = Math.max(10, columns() - 12 - stats.length - (showPet ? 9 : 0))
    process.stdout.write(`\r\x1b[2K${head}${truncateMiddle(label, room)} ${t.muted(stats)}`)
    this.tick++
  }
}
