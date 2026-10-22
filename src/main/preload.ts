import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppState, Attachment, ChatEvent, Command, CrooApi, RunExit, UpdateProgress } from '../shared/ipc.js'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const attachListeners: ((a: Attachment[], skipped: string[]) => void)[] = []

const api: CrooApi = {
  getState: () => invoke('state:get'),
  addWorkspace: () => invoke('workspace:add'),
  removeWorkspace: (p) => invoke('workspace:remove', p),
  newChat: (cwd, kind) => invoke('chat:new', cwd, kind),
  openChat: (id) => invoke('chat:open', id),
  deleteChat: (id) => invoke('chat:delete', id),
  send: (chatId, text, attachments) => invoke('chat:send', chatId, text, attachments),
  rewind: (chatId, ordinal) => invoke('chat:rewind', chatId, ordinal),
  pickAttachments: () => invoke('attach:pick'),
  onAttach: (cb) => void attachListeners.push(cb),
  searchFiles: (cwd, query) => invoke('fs:search', cwd, query),
  searchChats: (query) => invoke('search:chats', query),
  setMemory: (on) => invoke('memory:set', on),
  removeMemory: (i) => invoke('memory:remove', i),
  clearMemory: () => invoke('memory:clear'),
  warmVoice: () => invoke('voice:warm'),
  downloadVoice: () => invoke('voice:download'),
  micAccess: () => invoke('voice:mic'),
  transcribe: (wav) => invoke('voice:transcribe', wav),
  exportChat: (name, text) => invoke('chat:export', name, text),
  suggestCommit: (cwd, paths) => invoke('git:suggest', cwd, paths),
  downloadLocal: (id) => invoke('local:download', id),
  cancelLocal: (id) => invoke('local:cancel', id),
  useLocal: (id) => invoke('local:use', id),
  deleteLocal: (id) => invoke('local:delete', id),
  setUser: (userName, avatar) => invoke('user:set', userName, avatar),
  setNotify: (on) => invoke('notify:set', on),
  setPrice: (profile, input, output) => invoke('profile:price', profile, input, output),
  installUpdate: () => invoke('update:install'),
  checkUpdate: () => invoke('update:check'),
  onUpdateProgress: (cb) => void ipcRenderer.on('update:progress', (_e, p: UpdateProgress) => cb(p)),
  onOpenChat: (cb) => void ipcRenderer.on('open-chat', (_e, id: string) => cb(id)),
  stop: (chatId) => invoke('chat:stop', chatId),
  answer: (chatId, confirmId, answer) => invoke('chat:answer', chatId, confirmId, answer),
  addProfile: (req) => invoke('profile:add', req),
  useProfile: (name) => invoke('profile:use', name),
  removeProfile: (name) => invoke('profile:remove', name),
  startDemo: () => invoke('demo:start'),
  setMode: (mode) => invoke('mode:set', mode),
  setEffort: (effort) => invoke('effort:set', effort),
  listModels: (profile) => invoke('models:list', profile),
  setModel: (profile, model) => invoke('models:set', profile, model),
  updateKey: (profile, apiKey) => invoke('profile:key', profile, apiKey),
  fsList: (cwd, rel) => invoke('fs:list', cwd, rel),
  fsRead: (cwd, rel) => invoke('fs:read', cwd, rel),
  reveal: (cwd, rel) => invoke('fs:reveal', cwd, rel),
  openExternal: (url) => invoke('shell:open', url),
  probePorts: () => invoke('browser:ports'),
  gitStatus: (cwd) => invoke('git:status', cwd),
  gitDiff: (cwd, file, untracked) => invoke('git:diff', cwd, file, untracked),
  gitCommit: (cwd, paths, message) => invoke('git:commit', cwd, paths, message),
  gitPush: (cwd, hasUpstream) => invoke('git:push', cwd, hasUpstream),
  gitPull: (cwd) => invoke('git:pull', cwd),
  gitInit: (cwd) => invoke('git:init', cwd),
  gitConnect: (cwd, remote) => invoke('git:connect', cwd, remote),
  gitPublish: (cwd, name, isPrivate) => invoke('git:publish', cwd, name, isPrivate),
  runCode: (cwd, kind, code) => invoke('run:start', cwd, kind, code),
  runStop: (id) => ipcRenderer.send('run:stop', id),
  onRunData: (cb) => void ipcRenderer.on('run:data', (_e, m: { id: string; data: string }) => cb(m.id, m.data)),
  onRunExit: (cb) => void ipcRenderer.on('run:exit', (_e, m: RunExit) => cb(m)),
  termCreate: (cwd, cols, rows) => invoke('term:create', cwd, cols, rows),
  termWrite: (id, data) => ipcRenderer.send('term:write', id, data),
  termResize: (id, cols, rows) => ipcRenderer.send('term:resize', id, cols, rows),
  termKill: (id) => ipcRenderer.send('term:kill', id),
  onTermData: (cb) => void ipcRenderer.on('term:data', (_e, m: { id: string; data: string }) => cb(m.id, m.data)),
  onTermExit: (cb) => void ipcRenderer.on('term:exit', (_e, m: { id: string }) => cb(m.id)),
  onState: (cb) => void ipcRenderer.on('state:changed', (_e, s: AppState) => cb(s)),
  onEvent: (cb) => void ipcRenderer.on('chat:event', (_e, ev: ChatEvent) => cb(ev)),
  onCommand: (cb) => void ipcRenderer.on('command', (_e, c: Command) => cb(c)),
}
contextBridge.exposeInMainWorld('croo', api)

// Dropping onto the message box attaches files; dropping anywhere else adds a folder.
// File paths are only readable here in the preload.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => {
  e.preventDefault()
  const paths = [...(e.dataTransfer?.files ?? [])].map((f) => webUtils.getPathForFile(f)).filter(Boolean)
  if (!paths.length) return
  const onComposer = (e.target as HTMLElement | null)?.closest?.('.composer-wrap, .thread, .scroll')
  void invoke('drop:paths', paths, !!onComposer).then((r: { attachments: Attachment[]; skipped: string[] }) => {
    if (r.attachments.length || r.skipped.length) attachListeners.forEach((cb) => cb(r.attachments, r.skipped))
  })
})
