import type { AppState, CrooApi, Item } from '../shared/ipc.js'

declare global {
  interface Window {
    croo: CrooApi
  }
}

export const croo = window.croo

export type ChatStatus = 'idle' | 'thinking' | 'working' | 'waiting'

export interface ChatView {
  id: string
  cwd: string
  items: Item[]
  status: ChatStatus
  label: string
  /** Quiet line after a turn, like "Done in 3.2s". */
  note?: string
  draft: string
}

export const store = {
  state: null as unknown as AppState,
  active: null as string | null,
  views: new Map<string, ChatView>(),
}

/** Late-bound render hooks, so views can ask each other to redraw without import cycles. */
export const bus = {
  sidebar: () => {},
  main: () => {},
  openChat: async (_id: string) => {},
  newChat: async (_cwd: string) => {},
  settings: () => {},
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
