import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppState, ChatEvent, Command, CrooApi, RunExit } from '../shared/ipc.js'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api: CrooApi = {
  getState: () => invoke('state:get'),
  addWorkspace: () => invoke('workspace:add'),
  removeWorkspace: (p) => invoke('workspace:remove', p),
  newChat: (cwd, kind) => invoke('chat:new', cwd, kind),
  openChat: (id) => invoke('chat:open', id),
  deleteChat: (id) => invoke('chat:delete', id),
  send: (chatId, text) => invoke('chat:send', chatId, text),
  stop: (chatId) => invoke('chat:stop', chatId),
  answer: (chatId, confirmId, answer) => invoke('chat:answer', chatId, confirmId, answer),
  addProfile: (req) => invoke('profile:add', req),
  useProfile: (name) => invoke('profile:use', name),
  removeProfile: (name) => invoke('profile:remove', name),
  startDemo: () => invoke('demo:start'),
  setMode: (mode) => invoke('mode:set', mode),
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

// Dropping a folder anywhere on the window adds it. File paths are only readable here.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => {
  e.preventDefault()
  const paths = [...(e.dataTransfer?.files ?? [])].map((f) => webUtils.getPathForFile(f)).filter(Boolean)
  if (paths.length) void invoke('workspace:addPaths', paths)
})
