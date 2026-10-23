import type { AppState, Attachment, ChatKind, Command, CrooApi, Item, UpdateProgress } from '../shared/ipc.js'

declare global {
  interface Window {
    croo: CrooApi
  }
}

export const croo = window.croo

export type ChatStatus = 'idle' | 'thinking' | 'working' | 'waiting'

export interface ChatView {
  id: string
  kind: ChatKind
  cwd: string
  items: Item[]
  status: ChatStatus
  label: string
  /** Quiet line after a turn, like "Done in 3.2s". */
  note?: string
  draft: string
  /** When the current turn began, and what it has used so far. */
  t0?: number
  tokens?: { input: number; output: number; cacheRead?: number; cacheWrite?: number }
  /** Characters streamed since the last usage report, to estimate output while it is still arriving. */
  streamed?: number
  /** Files and images waiting in the message box. */
  attachments?: Attachment[]
  /** How full the model's context was after the last request, for the ring in the header. */
  context?: { used: number; window: number }
  /** The pinned task list: opened or closed by hand (undefined follows the list), and a finished list the user hid. */
  tasksOpen?: boolean
  tasksDismissed?: string
  /** Turns (0-based typed messages) whose file changes Croo can restore. */
  checkpoints?: number[]
  /** Messages typed while the agent was busy; each is sent when the one before it finishes. */
  queue?: { text: string; atts: Attachment[] }[]
}

export const store = {
  state: null as unknown as AppState,
  /** Chat mode (plain conversations) or Code mode (folders and the agent). */
  mode: 'code' as ChatKind,
  active: null as string | null,
  /** Changed files in the current folder (drives the badge on the Git button). */
  gitCount: 0,
  views: new Map<string, ChatView>(),
}

/** Late-bound render hooks, so views can ask each other to redraw without import cycles. */
export const bus = {
  sidebar: () => {},
  main: () => {},
  openChat: async (_id: string) => {},
  newChat: async (_cwd: string, _kind: ChatKind) => {},
  settings: () => {},
  command: (_c: Command) => {},
  mode: (_kind: ChatKind) => {},
  terminal: () => {},
  files: () => {},
  browser: () => {},
  git: () => {},
  /** Insert text into the open composer, e.g. a file mention. */
  insert: (_text: string) => {},
}

export const remember = {
  get(key: string): string | null {
    try {
      return localStorage.getItem('croo.' + key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem('croo.' + key, value)
    } catch {}
  },
}

/** Fonts for the app text, all already on the machine. The first is the default and leaves the stylesheet's stack alone. */
export const FONTS: { id: string; label: string; stack?: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'rounded', label: 'Rounded', stack: "ui-rounded, 'SF Pro Rounded', 'Hiragino Maru Gothic ProN', 'Nunito', system-ui, sans-serif" },
  { id: 'humanist', label: 'Humanist', stack: "'Avenir Next', Avenir, Seravek, 'Gill Sans', 'Segoe UI', Optima, sans-serif" },
  { id: 'serif', label: 'Serif', stack: "ui-serif, 'New York', Charter, 'Iowan Old Style', Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'Mono', stack: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace" },
]
export function applyFont(id: string) {
  const f = FONTS.find((x) => x.id === id)
  if (f?.stack) document.documentElement.style.setProperty('--font', f.stack)
  else document.documentElement.style.removeProperty('--font')
  remember.set('font', f?.id ?? 'default')
}
applyFont(remember.get('font') ?? 'default')

/** Where an in-app update is, for the sidebar banner and Settings → About. Null when none is running. */
export let updateProgress: { text: string; fraction?: number } | null = null
const updateListeners = new Set<() => void>()
/** Called on every progress step; returns a function that stops listening. */
export function onUpdateProgress(cb: () => void): () => void {
  updateListeners.add(cb)
  return () => updateListeners.delete(cb)
}
const mb = (n: number) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0)
function setUpdateProgress(p: typeof updateProgress) {
  updateProgress = p
  for (const cb of updateListeners) cb()
}
croo.onUpdateProgress((p: UpdateProgress) => {
  if (p.phase === 'install') return setUpdateProgress({ text: 'Installing, Croo will restart…', fraction: 1 })
  const fraction = p.total ? Math.min(1, p.received / p.total) : undefined
  setUpdateProgress({
    text: fraction === undefined ? `Downloading… ${mb(p.received)} MB` : `Downloading… ${Math.floor(fraction * 100)}% · ${mb(p.received)} of ${mb(p.total!)} MB`,
    fraction,
  })
})

/** Download the update, swap it in and relaunch. Returns an error message if it could not. */
export async function installUpdate(): Promise<string | undefined> {
  setUpdateProgress({ text: 'Starting download…', fraction: 0 })
  const r = await croo.installUpdate()
  // On success the app is about to quit; anything else (an error, or the download page opened instead) ends here.
  if (!r.ok || updateProgress?.fraction !== 1) setUpdateProgress(null)
  return r.ok ? undefined : r.error
}
