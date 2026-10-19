import { theme } from './theme.js'

const out = process.stdout

export const isTTY = !!out.isTTY
export const columns = () => (out.isTTY && out.columns ? out.columns : 80)

let cursorHidden = false
let handlersInstalled = false

function restoreCursor() {
  if (cursorHidden && out.isTTY) out.write('\x1b[?25h')
  cursorHidden = false
}

/** Hide the cursor, guaranteeing it is restored on exit, signals and crashes. */
export function hideCursor() {
  if (!out.isTTY) return
  if (!handlersInstalled) {
    handlersInstalled = true
    process.on('exit', restoreCursor)
    process.on('uncaughtException', (e) => {
      restoreCursor()
      console.error(theme.error(String(e instanceof Error ? e.stack || e.message : e)))
      process.exit(1)
    })
    for (const sig of ['SIGTERM', 'SIGHUP'] as const) {
      process.on(sig, () => {
        restoreCursor()
        process.exit(1)
      })
    }
  }
  cursorHidden = true
  out.write('\x1b[?25l')
}

export const showCursor = restoreCursor

export function shortenPath(p: string, home = process.env.HOME || ''): string {
  return home && p.startsWith(home) ? '~' + p.slice(home.length) : p
}

export function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s
  const keep = Math.max(4, max - 1)
  const head = Math.ceil(keep / 2)
  return s.slice(0, head) + '…' + s.slice(s.length - (keep - head))
}
