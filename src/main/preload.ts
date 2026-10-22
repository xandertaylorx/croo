import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppState, ChatEvent, Command, CrooApi } from '../shared/ipc.js'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api: CrooApi = {
  getState: () => invoke('state:get'),
  addWorkspace: () => invoke('workspace:add'),
  removeWorkspace: (p) => invoke('workspace:remove', p),
  newChat: (cwd) => invoke('chat:new', cwd),
  openChat: (id) => invoke('chat:open', id),
  deleteChat: (id) => invoke('chat:delete', id),
  send: (chatId, text) => invoke('chat:send', chatId, text),
  stop: (chatId) => invoke('chat:stop', chatId),
  answer: (chatId, confirmId, answer) => invoke('chat:answer', chatId, confirmId, answer),
  addProfile: (req) => invoke('profile:add', req),
  useProfile: (name) => invoke('profile:use', name),
  removeProfile: (name) => invoke('profile:remove', name),
  startDemo: () => invoke('demo:start'),
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
