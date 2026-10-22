import type { AppState, Attachment, ChatKind, Command, CrooApi, Item } from '../shared/ipc.js'

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
  tokens?: { input: number; output: number }
  /** Characters streamed since the last usage report, to estimate output while it is still arriving. */
  streamed?: number
  /** Files and images waiting in the message box. */
  attachments?: Attachment[]
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

/** Download the update, swap it in and relaunch. Returns an error message if it could not. */
export async function installUpdate(): Promise<string | undefined> {
  const r = await croo.installUpdate()
  return r.ok ? undefined : r.error
}
