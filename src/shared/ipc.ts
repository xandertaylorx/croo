/** Types shared by the main process, the preload bridge and the renderer. */
import type { DiffLine } from '../tools/diff.js'

export type ToolStatus = 'running' | 'ok' | 'error' | 'denied'

export type PreviewDto =
  | { kind: 'diff'; path: string; lines: (DiffLine | null)[]; added: number; removed: number; more: number }
  | { kind: 'command'; command: string }

/** What a chat shows. `confirm` only ever exists live, never in a saved transcript. */
export type Item =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; streaming?: boolean }
  | { kind: 'tool'; name: string; summary: string; status: ToolStatus; result?: string }
  | { kind: 'confirm'; id: string; name: string; summary: string; preview: PreviewDto }
  | { kind: 'error'; text: string }

export type ChatEvent = { chatId: string } & (
  | { type: 'thinking' }
  | { type: 'text'; delta: string }
  | { type: 'textEnd' }
  | { type: 'toolRunning'; name: string; summary: string }
  | { type: 'toolDone'; name: string; summary: string; ok: boolean; result: string }
  | { type: 'confirm'; id: string; name: string; summary: string; preview: PreviewDto }
  | { type: 'done'; seconds: number }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }
)

export interface ChatInfo {
  id: string
  title: string
  updatedAt: string
  running: boolean
}

export interface WorkspaceInfo {
  path: string
  name: string
  missing: boolean
  chats: ChatInfo[]
}

export interface ProfileInfo {
  name: string
  provider: string
  model: string
  active: boolean
  hasKey: boolean
}

export interface AppState {
  platform: string
  home: string
  /** A usable provider (or demo mode) is set up. */
  ready: boolean
  demo: boolean
  profiles: ProfileInfo[]
  workspaces: WorkspaceInfo[]
  configError?: string
}

export interface AddProfileRequest {
  /** One of the preset ids, or empty for a custom OpenAI-compatible URL. */
  presetId?: string
  baseUrl?: string
  model?: string
  apiKey?: string
}

export type Result = { ok: true } | { ok: false; error: string }

export type Command = 'newChat' | 'addFolder' | 'settings' | 'toggleSidebar'

export interface CrooApi {
  getState(): Promise<AppState>
  addWorkspace(): Promise<void>
  removeWorkspace(path: string): Promise<void>
  newChat(cwd: string): Promise<string>
  openChat(id: string): Promise<{ cwd: string; title: string; items: Item[] } | null>
  deleteChat(id: string): Promise<void>
  send(chatId: string, text: string): Promise<Result>
  stop(chatId: string): Promise<void>
  answer(chatId: string, confirmId: string, answer: 'y' | 'n' | 'a'): Promise<void>
  addProfile(req: AddProfileRequest): Promise<Result>
  useProfile(name: string): Promise<void>
  removeProfile(name: string): Promise<void>
  startDemo(): Promise<void>
  onState(cb: (s: AppState) => void): void
  onEvent(cb: (e: ChatEvent) => void): void
  onCommand(cb: (c: Command) => void): void
}
