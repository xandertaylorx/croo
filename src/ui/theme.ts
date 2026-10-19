/** All colours live here. One green accent, muted greys, red errors, yellow warnings. */

export type ColorLevel = 0 | 1 | 2 | 3 // none | 16 | 256 | truecolor

export const palette = {
  accent: [94, 214, 126],
  muted: [128, 134, 130],
  error: [240, 98, 98],
  warn: [236, 201, 75],
  text: [220, 224, 220],
} as const

type RGB = readonly [number, number, number]

export function detectColorLevel(
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = !!process.stdout.isTTY,
): ColorLevel {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 0
  const force = env.FORCE_COLOR
  if (force === '0') return 0
  if (!isTTY && !force) return 0
  if (env.TERM === 'dumb') return 0
  if (force === '1') return 1
  if (force === '2') return 2
  if (force === '3') return 3
  const ct = (env.COLORTERM || '').toLowerCase()
  if (ct === 'truecolor' || ct === '24bit') return 3
  if ((env.TERM || '').includes('256color') || env.TERM_PROGRAM === 'Apple_Terminal') return 2
  return 1
}

function to256([r, g, b]: RGB): number {
  if (r === g && g === b) {
    if (r < 8) return 16
    if (r > 248) return 231
    return 232 + Math.round(((r - 8) / 247) * 24)
  }
  const c = (v: number) => Math.round((v / 255) * 5)
  return 16 + 36 * c(r) + 6 * c(g) + c(b)
}

function to16([r, g, b]: RGB): number {
  const max = Math.max(r, g, b)
  if (max < 60) return 30
  const bright = max > 200 ? 60 : 0
  const bit = (v: number) => (v > max * 0.6 ? 1 : 0)
  return 30 + bright + bit(r) + bit(g) * 2 + bit(b) * 4
}

export interface Theme {
  level: ColorLevel
  enabled: boolean
  accent(s: string): string
  muted(s: string): string
  error(s: string): string
  warn(s: string): string
  text(s: string): string
  bold(s: string): string
  dim(s: string): string
  italic(s: string): string
}

export function createTheme(level: ColorLevel): Theme {
  const wrap = (open: string, close: string) => (s: string) => (level === 0 ? s : `\x1b[${open}m${s}\x1b[${close}m`)
  const fg = (rgb: RGB) => {
    if (level === 0) return (s: string) => s
    const open = level === 3 ? `38;2;${rgb[0]};${rgb[1]};${rgb[2]}` : level === 2 ? `38;5;${to256(rgb)}` : `${to16(rgb)}`
    return (s: string) => `\x1b[${open}m${s}\x1b[39m`
  }
  return {
    level,
    enabled: level > 0,
    accent: fg(palette.accent),
    muted: fg(palette.muted),
    error: fg(palette.error),
    warn: fg(palette.warn),
    text: fg(palette.text),
    bold: wrap('1', '22'),
    dim: wrap('2', '22'),
    italic: wrap('3', '23'),
  }
}

export const theme: Theme = createTheme(detectColorLevel())

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g
export const stripAnsi = (s: string) => s.replace(ANSI_RE, '')
export const visibleLength = (s: string) => [...stripAnsi(s)].length
