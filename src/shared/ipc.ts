/** Types shared by the main process, the preload bridge and the renderer. */
import type { DiffLine } from '../tools/diff.js'
import type { Effort } from '../effort.js'
import type { PermissionMode } from '../types.js'

export type { Effort, PermissionMode }

export type ToolStatus = 'running' | 'ok' | 'error' | 'denied'

export type PreviewDto =
  | { kind: 'diff'; path: string; lines: (DiffLine | null)[]; added: number; removed: number; more: number }
  | { kind: 'command'; command: string }
  | { kind: 'read'; tool: string; summary: string }

/** What a chat shows. `confirm` only ever exists live, never in a saved transcript. */
export interface AttachmentView {
  name: string
  kind: 'image' | 'file'
  /** Images only: a data: URL to show. */
  dataUrl?: string
  /** Bytes, for the little "2 KB" label. */
  size?: number
}

export type Item =
  | { kind: 'user'; text: string; attachments?: AttachmentView[] }
  | { kind: 'assistant'; text: string; streaming?: boolean }
  | { kind: 'thinking'; text: string; done: boolean; seconds?: number }
  | { kind: 'tool'; name: string; summary: string; status: ToolStatus; result?: string }
  | { kind: 'confirm'; id: string; name: string; summary: string; preview: PreviewDto }
  | { kind: 'error'; text: string }

export type ChatEvent = { chatId: string } & (
  | { type: 'thinking' }
  | { type: 'usage'; input: number; output: number }
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

export interface LocalModelInfo {
  id: string
  name: string
  blurb: string
  bytes: number
  status: 'none' | 'downloading' | 'ready'
  /** 0..1 while downloading. */
  progress: number
  error?: string
  active: boolean
  /** This Mac has enough memory for it. */
  fits: boolean
}

export interface VoiceInfo {
  /** whisper is part of this build. */
  engine: boolean
  status: 'none' | 'downloading' | 'ready'
  progress: number
  bytes: number
  error?: string
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
  /** Run by Croo itself (the downloaded local model), managed from the local model card. */
  engine: boolean
  /** Effort levels this provider's model accepts, empty when it has no such setting. */
  efforts: Effort[]
  /** What the model costs per million tokens, when known. */
  price?: { input: number; output: number; source: 'built-in' | 'custom' | 'local' }
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

/** Something sent along with a message. Images carry a data: URL, text files their text. */
export interface Attachment {
  name: string
  kind: 'image' | 'file'
  mime?: string
  dataUrl?: string
  text?: string
}

export interface UpdateInfo {
  version: string
  /** Where "Get it" goes: the installer for this machine if the release has one, else the release page. */
  url: string
  page: string
  /** macOS only: the zip the app can download and swap in for itself. */
  zip?: string
  notes?: string
}

export type { ChatHit } from '../chatsearch.js'

export interface GitFile {
  path: string
  /** Status letters from `git status`: X is the index, Y the working tree ("?" = untracked). */
  index: string
  work: string
  orig?: string
  add?: number
  del?: number
}

export interface GitStatus {
  repo: boolean
  branch: string
  upstream?: string
  ahead: number
  behind: number
  files: GitFile[]
  /** Configured remotes; empty means pushing has nowhere to go yet. */
  remotes: string[]
  /** The GitHub CLI is installed and signed in, so a repository can be created from here. */
  gh: boolean
}

export interface GitResult {
  ok: boolean
  output: string
  /** A plain-language explanation and fix when git failed in a way we recognise. */
  hint?: string
}

export interface RunExit {
  id: string
  code: number | null
  signal: string | null
}

export type RunKind = 'shell' | 'python' | 'node'

export interface AppState {
  platform: string
  version: string
  home: string
  /** Keys are encrypted with the OS keychain. */
  secureKeys: boolean
  /** A usable provider (or demo mode) is set up. */
  ready: boolean
  demo: boolean
  permissionMode: PermissionMode
  effort: Effort
  notify: boolean
  memory: boolean
  memoryEntries: { date: string; text: string }[]
  userName: string
  /** Small image data URL, or empty. */
  avatar: string
  update?: UpdateInfo
  profiles: ProfileInfo[]
  /** Models Croo can download and run on this Mac, and whether the engine is part of this build. */
  localModels: LocalModelInfo[]
  engine: boolean
  voice: VoiceInfo
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

export type Command = 'newChat' | 'addFolder' | 'settings' | 'toggleSidebar' | 'toggleTerminal' | 'toggleFiles' | 'toggleBrowser' | 'toggleGit' | 'search' | 'modeChat' | 'modeCode'

export interface CrooApi {
  getState(): Promise<AppState>
  addWorkspace(): Promise<void>
  removeWorkspace(path: string): Promise<void>
  newChat(cwd: string, kind: ChatKind): Promise<string>
  openChat(id: string): Promise<{ cwd: string; kind: ChatKind; title: string; items: Item[] } | null>
  deleteChat(id: string): Promise<void>
  send(chatId: string, text: string, attachments?: Attachment[]): Promise<Result>
  /** Cut the chat back to before the n-th user message (0-based) so it can be edited or sent again. */
  rewind(chatId: string, ordinal: number): Promise<{ ok: true; text: string; attachments: Attachment[] } | { ok: false; error: string }>
  pickAttachments(): Promise<{ attachments: Attachment[]; skipped: string[] }>
  onAttach(cb: (a: Attachment[], skipped: string[]) => void): void
  searchFiles(cwd: string, query: string): Promise<string[]>
  searchChats(query: string): Promise<import('../chatsearch.js').ChatHit[]>
  setNotify(on: boolean): Promise<void>
  setPrice(profile: string, input?: number, output?: number): Promise<void>
  /** Download the update, replace this app and relaunch. Resolves only on failure (on success the app quits). */
  installUpdate(): Promise<Result>
  checkUpdate(): Promise<{ ok: true; current: string; update?: UpdateInfo } | { ok: false; error: string }>
  onOpenChat(cb: (id: string) => void): void
  stop(chatId: string): Promise<void>
  answer(chatId: string, confirmId: string, answer: 'y' | 'n' | 'a'): Promise<void>
  addProfile(req: AddProfileRequest): Promise<Result>
  useProfile(name: string): Promise<void>
  removeProfile(name: string): Promise<void>
  startDemo(): Promise<void>
  setMode(mode: PermissionMode): Promise<void>
  setEffort(effort: Effort): Promise<void>
  setMemory(on: boolean): Promise<void>
  removeMemory(index: number): Promise<void>
  clearMemory(): Promise<void>
  downloadVoice(): Promise<void>
  /** Get the speech engine ready while the user is still talking. */
  warmVoice(): Promise<void>
  /** Ask macOS for the microphone; false when it was refused. */
  micAccess(): Promise<boolean>
  /** 16 kHz mono WAV in, text out. */
  transcribe(wav: ArrayBuffer): Promise<{ ok: true; text: string } | { ok: false; error: string }>
  /** Save a chat as a markdown file (asks where). Resolves true if saved. */
  exportChat(name: string, text: string): Promise<boolean>
  /** Draft a commit message for these files with the selected model. */
  suggestCommit(cwd: string, paths: string[]): Promise<{ ok: true; message: string } | { ok: false; error: string }>
  downloadLocal(id: string): Promise<void>
  cancelLocal(id: string): Promise<void>
  useLocal(id: string): Promise<void>
  deleteLocal(id: string): Promise<void>
  setUser(userName: string, avatar: string): Promise<void>
  listModels(profile?: string): Promise<{ models: ModelInfo[]; error?: string }>
  setModel(profile: string, model: string): Promise<void>
  updateKey(profile: string, apiKey: string): Promise<Result>
  fsList(cwd: string, rel: string): Promise<FsEntry[]>
  fsRead(cwd: string, rel: string): Promise<FsFile | null>
  reveal(cwd: string, rel: string): Promise<void>
  openExternal(url: string): Promise<void>
  /** Local dev servers that are currently listening. */
  probePorts(): Promise<number[]>
  gitStatus(cwd: string): Promise<GitStatus>
  gitDiff(cwd: string, file: string, untracked: boolean): Promise<string>
  gitCommit(cwd: string, paths: string[], message: string): Promise<GitResult>
  gitPush(cwd: string, hasUpstream: boolean): Promise<GitResult>
  gitPull(cwd: string): Promise<GitResult>
  gitInit(cwd: string): Promise<GitResult>
  /** Add (or replace) origin, then push. Accepts a URL or GitHub's owner/repo shorthand. */
  gitConnect(cwd: string, remote: string): Promise<GitResult>
  /** Create a GitHub repository with the gh CLI and push to it. */
  gitPublish(cwd: string, name: string, isPrivate: boolean): Promise<GitResult>
  /** Run a snippet from the chat in the folder; output streams back through onRunData / onRunExit. */
  runCode(cwd: string, kind: RunKind, code: string): Promise<string>
  runStop(id: string): void
  onRunData(cb: (id: string, data: string) => void): void
  onRunExit(cb: (e: RunExit) => void): void
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
