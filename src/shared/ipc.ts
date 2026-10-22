/** Types shared by the main process, the preload bridge and the renderer. */
import type { DiffLine } from '../tools/diff.js'
import type { PermissionMode } from '../types.js'

export type { PermissionMode }

export type ToolStatus = 'running' | 'ok' | 'error' | 'denied'

export type PreviewDto =
  | { kind: 'diff'; path: string; lines: (DiffLine | null)[]; added: number; removed: number; more: number }
  | { kind: 'command'; command: string }
  | { kind: 'read'; tool: string; summary: string }

/** What a chat shows. `confirm` only ever exists live, never in a saved transcript. */
export type Item =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; streaming?: boolean }
  | { kind: 'thinking'; text: string; done: boolean; seconds?: number }
  | { kind: 'tool'; name: string; summary: string; status: ToolStatus; result?: string }
  | { kind: 'confirm'; id: string; name: string; summary: string; preview: PreviewDto }
  | { kind: 'error'; text: string }

export type ChatEvent = { chatId: string } & (
  | { type: 'thinking' }
  | { type: 'reasoning'; delta: string }
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
  /** Which of AGENTS.md / CLAUDE.md / CROO.md Croo reads in this folder. */
  instructions: string[]
  chats: ChatInfo[]
}

export interface ProfileInfo {
  name: string
  provider: string
  model: string
  active: boolean
  hasKey: boolean
  /** Masked, e.g. sk-…a1b2. */
  keyHint: string
  keySource: 'saved' | 'env' | 'none'
  local: boolean
}

export interface ModelInfo {
  id: string
  name?: string
}

export interface FsEntry {
  name: string
  rel: string
  dir: boolean
}

export interface FsFile {
  rel: string
  kind: 'text' | 'image' | 'binary'
  size: number
  text?: string
  dataUrl?: string
  truncated?: boolean
}

export type ChatKind = 'chat' | 'code'

export interface AppState {
  platform: string
  home: string
  /** Keys are encrypted with the OS keychain. */
  secureKeys: boolean
  /** A usable provider (or demo mode) is set up. */
  ready: boolean
  demo: boolean
  permissionMode: PermissionMode
  profiles: ProfileInfo[]
  workspaces: WorkspaceInfo[]
  /** Plain conversations (Chat mode), newest first. */
  chats: ChatInfo[]
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

export type Command = 'newChat' | 'addFolder' | 'settings' | 'toggleSidebar' | 'toggleTerminal' | 'toggleFiles' | 'toggleBrowser' | 'modeChat' | 'modeCode'

export interface CrooApi {
  getState(): Promise<AppState>
  addWorkspace(): Promise<void>
  removeWorkspace(path: string): Promise<void>
  newChat(cwd: string, kind: ChatKind): Promise<string>
  openChat(id: string): Promise<{ cwd: string; kind: ChatKind; title: string; items: Item[] } | null>
  deleteChat(id: string): Promise<void>
  send(chatId: string, text: string): Promise<Result>
  stop(chatId: string): Promise<void>
  answer(chatId: string, confirmId: string, answer: 'y' | 'n' | 'a'): Promise<void>
  addProfile(req: AddProfileRequest): Promise<Result>
  useProfile(name: string): Promise<void>
  removeProfile(name: string): Promise<void>
  startDemo(): Promise<void>
  setMode(mode: PermissionMode): Promise<void>
  listModels(profile?: string): Promise<{ models: ModelInfo[]; error?: string }>
  setModel(profile: string, model: string): Promise<void>
  updateKey(profile: string, apiKey: string): Promise<Result>
  fsList(cwd: string, rel: string): Promise<FsEntry[]>
  fsRead(cwd: string, rel: string): Promise<FsFile | null>
  reveal(cwd: string, rel: string): Promise<void>
  openExternal(url: string): Promise<void>
  /** Local dev servers that are currently listening. */
  probePorts(): Promise<number[]>
  termCreate(cwd: string, cols: number, rows: number): Promise<string>
  termWrite(id: string, data: string): void
  termResize(id: string, cols: number, rows: number): void
  termKill(id: string): void
  onTermData(cb: (id: string, data: string) => void): void
  onTermExit(cb: (id: string) => void): void
  onState(cb: (s: AppState) => void): void
  onEvent(cb: (e: ChatEvent) => void): void
  onCommand(cb: (c: Command) => void): void
}
