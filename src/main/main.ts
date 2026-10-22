import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cancelled, runTurn } from '../agent.js'
import { isLocalUrl, loadConfig, resolveApiKey, saveConfig, defaultConfig } from '../config.js'
import { Permissions } from '../permissions.js'
import { buildSystemPrompt } from '../prompt.js'
import { demoProvider } from '../providers/demo.js'
import { createProvider } from '../providers/index.js'
import { checkProfile } from '../providers/models.js'
import { PRESETS } from '../providers/presets.js'
import { deleteSession, listSessions, loadSession, newSession, saveSession, titleFrom, type Session, type SessionMeta } from '../session.js'
import type { AddProfileRequest, AppState, ChatEvent, ChatInfo, Command, Result } from '../shared/ipc.js'
import { clip, toItems, toPreviewDto } from '../transcript.js'
import type { Config, Profile } from '../types.js'
import { loadWorkspaces, saveWorkspaces } from '../workspaces.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const isMac = process.platform === 'darwin'

// ---------- state ----------

let win: BrowserWindow | null = null
let cfg: Config = defaultConfig()
let configError: string | undefined
let demo = false
let workspaces: string[] = []
let saved = new Map<string, SessionMeta>()

interface Runtime {
  session: Session
  abort?: AbortController
  permissions: Permissions
  pending?: { id: string; resolve: (a: 'y' | 'n' | 'a') => void }
}
const runtimes = new Map<string, Runtime>()

const usable = (p: Profile) => !!resolveApiKey(p) || (p.type === 'openai' && isLocalUrl(p.baseUrl))
const activeProfile = (): [string, Profile] | null => {
  const p = cfg.profiles[cfg.activeProfile]
  return p ? [cfg.activeProfile, p] : null
}

function loadAll() {
  try {
    cfg = loadConfig() ?? defaultConfig()
    configError = undefined
  } catch (e: any) {
    cfg = defaultConfig()
    configError = e.message
  }
  workspaces = loadWorkspaces()
  saved = new Map(listSessions().map((s) => [s.id, s]))
}

function chatsFor(cwd: string): ChatInfo[] {
  const byId = new Map<string, ChatInfo>()
  for (const m of saved.values()) if (m.cwd === cwd) byId.set(m.id, { id: m.id, title: m.title, updatedAt: m.updatedAt, running: false })
  for (const [id, rt] of runtimes) {
    if (rt.session.cwd !== cwd) continue
    byId.set(id, { id, title: titleFrom(rt.session.messages), updatedAt: rt.session.updatedAt, running: !!rt.abort })
  }
  // Brand-new empty chats first, then newest.
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function buildState(): AppState {
  const active = activeProfile()
  return {
    platform: process.platform,
    home: os.homedir(),
    ready: demo || (!!active && usable(active[1])),
    demo,
    configError,
    profiles: Object.entries(cfg.profiles).map(([name, p]) => ({
      name,
      provider: p.baseUrl ? new URL(p.baseUrl).hostname.replace(/^api\./, '') : p.type,
      model: p.model,
      active: name === cfg.activeProfile,
      hasKey: usable(p),
    })),
    workspaces: workspaces.map((p) => ({ path: p, name: path.basename(p) || p, missing: !isDir(p), chats: chatsFor(p) })),
  }
}

const isDir = (p: string) => {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

const send = (channel: string, payload: unknown) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}
const pushState = () => send('state:changed', buildState())
const emit = (e: ChatEvent) => send('chat:event', e)

// ---------- workspaces ----------

function addWorkspaces(paths: string[]) {
  let changed = false
  for (const raw of paths) {
    const p = path.resolve(raw)
    if (isDir(p) && !workspaces.includes(p)) {
      workspaces.push(p)
      changed = true
    }
  }
  if (changed) {
    saveWorkspaces(workspaces)
    pushState()
  }
}

// ---------- chats ----------

function runtime(id: string): Runtime | null {
  const existing = runtimes.get(id)
  if (existing) return existing
  const session = loadSession(id)
  if (!session) return null
  const rt: Runtime = { session, permissions: new Permissions() }
  runtimes.set(id, rt)
  return rt
}

function startTurn(chatId: string, rt: Runtime, text: string) {
  const { session } = rt
  const messages = session.messages
  const before = messages.length
  messages.push({ role: 'user', content: text })
  const ac = (rt.abort = new AbortController())
  const t0 = Date.now()
  const active = activeProfile()
  session.profile = active?.[0] ?? 'demo'

  const run = async () => {
    try {
      const provider = demo ? demoProvider() : createProvider(active![1])
      await runTurn({
        provider,
        system: buildSystemPrompt(session.cwd),
        messages,
        cwd: session.cwd,
        permissions: rt.permissions,
        signal: ac.signal,
        hooks: {
          onThinking: () => emit({ chatId, type: 'thinking' }),
          onText: (delta) => emit({ chatId, type: 'text', delta }),
          onTextEnd: () => emit({ chatId, type: 'textEnd' }),
          onToolRunning: (name, summary) => emit({ chatId, type: 'toolRunning', name, summary }),
          onToolDone: (name, summary, ok, result) => emit({ chatId, type: 'toolDone', name, summary, ok, result: clip(result) }),
          confirm: (name, preview) =>
            new Promise((resolve) => {
              const id = Math.random().toString(36).slice(2)
              rt.pending = { id, resolve }
              emit({ chatId, type: 'confirm', id, name, summary: preview.kind === 'diff' ? preview.path : preview.command, preview: toPreviewDto(preview) })
            }),
          onUsage: () => {},
        },
      })
      emit({ chatId, type: 'done', seconds: (Date.now() - t0) / 1000 })
    } catch (e: any) {
      if (e instanceof Cancelled) emit({ chatId, type: 'cancelled' })
      else {
        messages.length = before
        emit({ chatId, type: 'error', message: e?.message ?? String(e) })
      }
    } finally {
      rt.abort = undefined
      rt.pending = undefined
      session.updatedAt = new Date().toISOString()
      if (!demo && messages.length) {
        saveSession(session)
        saved.set(session.id, { id: session.id, cwd: session.cwd, title: session.title ?? titleFrom(messages), updatedAt: session.updatedAt })
      }
      pushState()
    }
  }
  void run()
  pushState()
}

function stopChat(rt: Runtime) {
  rt.abort?.abort()
  rt.pending?.resolve('n')
  rt.pending = undefined
}

// ---------- providers ----------

async function addProfile(req: AddProfileRequest): Promise<Result> {
  const preset = PRESETS.find((p) => p.id === req.presetId)
  let profile: Profile
  let base: string
  if (preset) {
    profile = { type: preset.type, model: req.model?.trim() || preset.model }
    if (preset.baseUrl) profile.baseUrl = preset.baseUrl
    if (!preset.noKey) {
      if (!req.apiKey?.trim()) return { ok: false, error: 'Paste your API key to continue.' }
      profile.apiKey = req.apiKey.trim()
    }
    base = preset.id
  } else {
    let url: URL
    try {
      url = new URL(req.baseUrl?.trim() ?? '')
    } catch {
      return { ok: false, error: 'Enter a valid base URL, like https://api.example.com/v1' }
    }
    profile = { type: 'openai', baseUrl: url.toString().replace(/\/+$/, ''), model: req.model?.trim() || 'gpt-4o' }
    if (req.apiKey?.trim()) profile.apiKey = req.apiKey.trim()
    else if (!isLocalUrl(profile.baseUrl)) return { ok: false, error: 'Paste your API key to continue.' }
    base = url.hostname.replace(/^api\./, '').split('.')[0]
  }

  const check = await checkProfile(profile)
  if (check.error) return { ok: false, error: check.error }
  profile.model = check.model

  let name = base
  // A profile that has no key yet is replaced in place instead of getting a "2" twin.
  for (let i = 2; cfg.profiles[name] && usable(cfg.profiles[name]); i++) name = `${base}${i}`
  cfg = { ...cfg, profiles: { ...cfg.profiles, [name]: profile }, activeProfile: name }
  demo = false
  saveConfig(cfg)
  pushState()
  return { ok: true }
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('state:get', () => buildState())

  ipcMain.handle('workspace:add', async () => {
    if (!win) return
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], title: 'Add a folder', buttonLabel: 'Add folder' })
    if (!r.canceled) addWorkspaces(r.filePaths)
  })
  ipcMain.handle('workspace:addPaths', (_e, paths: string[]) => addWorkspaces(paths))
  ipcMain.handle('workspace:remove', (_e, p: string) => {
    workspaces = workspaces.filter((w) => w !== p)
    saveWorkspaces(workspaces)
    pushState()
  })

  ipcMain.handle('chat:new', (_e, cwd: string) => {
    // Reuse an empty chat instead of piling up blanks.
    for (const [id, rt] of runtimes) if (rt.session.cwd === cwd && !rt.session.messages.length) return id
    const session = newSession(cwd, activeProfile()?.[0] ?? 'demo')
    runtimes.set(session.id, { session, permissions: new Permissions() })
    pushState()
    return session.id
  })
  ipcMain.handle('chat:open', (_e, id: string) => {
    const rt = runtime(id)
    return rt ? { cwd: rt.session.cwd, title: titleFrom(rt.session.messages), items: toItems(rt.session.messages) } : null
  })
  ipcMain.handle('chat:delete', (_e, id: string) => {
    const rt = runtimes.get(id)
    if (rt) stopChat(rt)
    runtimes.delete(id)
    saved.delete(id)
    deleteSession(id)
    pushState()
  })
  ipcMain.handle('chat:send', (_e, chatId: string, text: string): Result => {
    const rt = runtime(chatId)
    if (!rt) return { ok: false, error: 'That chat no longer exists.' }
    if (rt.abort) return { ok: false, error: 'Croo is still working on the last message.' }
    if (!isDir(rt.session.cwd)) return { ok: false, error: `The folder ${rt.session.cwd} no longer exists.` }
    const active = activeProfile()
    if (!demo && !(active && usable(active[1]))) return { ok: false, error: 'Add a provider in Settings first.' }
    startTurn(chatId, rt, text)
    return { ok: true }
  })
  ipcMain.handle('chat:stop', (_e, chatId: string) => {
    const rt = runtimes.get(chatId)
    if (rt) stopChat(rt)
  })
  ipcMain.handle('chat:answer', (_e, chatId: string, confirmId: string, answer: 'y' | 'n' | 'a') => {
    const rt = runtimes.get(chatId)
    if (rt?.pending?.id !== confirmId) return
    const { resolve } = rt.pending
    rt.pending = undefined
    resolve(answer)
  })

  ipcMain.handle('profile:add', (_e, req: AddProfileRequest) => addProfile(req))
  ipcMain.handle('profile:use', (_e, name: string) => {
    if (!cfg.profiles[name]) return
    cfg = { ...cfg, activeProfile: name }
    demo = false
    saveConfig(cfg)
    pushState()
  })
  ipcMain.handle('profile:remove', (_e, name: string) => {
    const { [name]: _gone, ...rest } = cfg.profiles
    cfg = { ...cfg, profiles: rest, activeProfile: cfg.activeProfile === name ? (Object.keys(rest)[0] ?? '') : cfg.activeProfile }
    saveConfig(cfg)
    pushState()
  })
  ipcMain.handle('demo:start', () => {
    demo = true
    pushState()
  })
}

// ---------- window & menu ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 740,
    minWidth: 760,
    minHeight: 480,
    show: false,
    title: 'Croo',
    backgroundColor: isMac ? '#00000000' : undefined,
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 18, y: 18 }, vibrancy: 'sidebar' as const, visualEffectState: 'active' as const }
      : { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#00000000', symbolColor: '#8a928c', height: 44 } }),
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => (win = null))

  // Links open in the real browser; the app window never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault()
      if (/^https?:/i.test(url)) void shell.openExternal(url)
    }
  })
  void win.loadFile(path.join(here, '..', 'renderer', 'index.html'))
}

function buildMenu() {
  const cmd = (c: Command) => () => send('command', c)
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: cmd('newChat') },
        { label: 'Add Folder…', accelerator: 'CmdOrCtrl+O', click: cmd('addFolder') },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: cmd('settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: cmd('toggleSidebar') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' as const }, { role: 'reload' as const }, { role: 'toggleDevTools' as const }]),
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
else {
  app.on('second-instance', () => {
    if (win?.isMinimized()) win.restore()
    win?.focus()
  })
  app.setName('Croo')
  void app.whenReady().then(() => {
    loadAll()
    registerIpc()
    buildMenu()
    if (isMac) {
      const icon = path.join(here, '..', '..', 'build', 'icon.png')
      if (fs.existsSync(icon)) app.dock?.setIcon(icon)
    }
    createWindow()
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow()
    })
  })
  app.on('window-all-closed', () => {
    if (!isMac) app.quit()
  })
  app.on('before-quit', () => {
    for (const rt of runtimes.values()) stopChat(rt)
  })
}
