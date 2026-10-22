import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from 'electron'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cancelled, runTurn } from '../agent.js'
import { EFFORTS, effortLevels, type Effort } from '../effort.js'
import { isLocalUrl, loadConfig, maskKey, resolveApiKey, saveConfig, defaultConfig } from '../config.js'
import { Permissions } from '../permissions.js'
import { INIT_PROMPT, buildChatPrompt, buildSystemPrompt, instructionFiles } from '../prompt.js'
import { demoProvider } from '../providers/demo.js'
import { createProvider } from '../providers/index.js'
import { checkProfile, listModels } from '../providers/models.js'
import { PRESETS } from '../providers/presets.js'
import { deleteSession, listSessions, loadSession, newSession, saveSession, titleFrom, type Session, type SessionMeta } from '../session.js'
import type { AddProfileRequest, AppState, ChatEvent, ChatInfo, ChatKind, Command, FsEntry, FsFile, Result, RunKind } from '../shared/ipc.js'
import { Ignore } from '../tools/ignore.js'
import { safePath } from '../tools/index.js'
import { clip, toItems, toPreviewDto } from '../transcript.js'
import { gitCommit, gitConnect, gitDiff, gitInit, gitPublish, gitPull, gitPush, gitStatus } from './git.js'
import { Runner } from './runner.js'
import { Terminals } from './terminal.js'
import type { Config, PermissionMode, Profile } from '../types.js'
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
const terminals = new Terminals()
const runner = new Runner()

const modelCache = new Map<string, { at: number; value: Awaited<ReturnType<typeof listModels>> }>()

const usable = (p: Profile) => !!resolveApiKey(p) || (p.type === 'openai' && isLocalUrl(p.baseUrl))
const activeProfile = (): [string, Profile] | null => {
  const p = cfg.profiles[cfg.activeProfile]
  return p ? [cfg.activeProfile, p] : null
}

/** Keys are stored encrypted with the OS keychain when it is available (and never in plain text on disk then). */
function persist() {
  const out: Config = { ...cfg, profiles: {} }
  for (const [name, p] of Object.entries(cfg.profiles)) {
    const q = { ...p }
    if (q.apiKey && safeStorage.isEncryptionAvailable()) {
      try {
        q.apiKeyEnc = safeStorage.encryptString(q.apiKey).toString('base64')
        delete q.apiKey
      } catch {}
    }
    out.profiles[name] = q
  }
  saveConfig(out)
}

function decryptKeys() {
  for (const p of Object.values(cfg.profiles)) {
    if (!p.apiKeyEnc) continue
    try {
      p.apiKey = safeStorage.decryptString(Buffer.from(p.apiKeyEnc, 'base64'))
    } catch {} // a different machine or keychain: the profile just shows as having no key
  }
}

function loadAll() {
  try {
    cfg = loadConfig() ?? defaultConfig()
    decryptKeys()
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
  for (const m of saved.values()) if (m.kind === 'code' && m.cwd === cwd) byId.set(m.id, { id: m.id, title: m.title, updatedAt: m.updatedAt, running: false })
  for (const [id, rt] of runtimes) {
    if (rt.session.kind === 'chat' || rt.session.cwd !== cwd) continue
    byId.set(id, { id, title: titleFrom(rt.session.messages), updatedAt: rt.session.updatedAt, running: !!rt.abort })
  }
  // Brand-new empty chats first, then newest.
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function plainChats(): ChatInfo[] {
  const byId = new Map<string, ChatInfo>()
  for (const m of saved.values()) if (m.kind === 'chat') byId.set(m.id, { id: m.id, title: m.title, updatedAt: m.updatedAt, running: false })
  for (const [id, rt] of runtimes) {
    if (rt.session.kind !== 'chat') continue
    byId.set(id, { id, title: titleFrom(rt.session.messages), updatedAt: rt.session.updatedAt, running: !!rt.abort })
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function buildState(): AppState {
  const active = activeProfile()
  return {
    platform: process.platform,
    home: os.homedir(),
    secureKeys: safeStorage.isEncryptionAvailable(),
    ready: demo || (!!active && usable(active[1])),
    demo,
    permissionMode: cfg.permissionMode,
    effort: cfg.effort,
    configError,
    profiles: Object.entries(cfg.profiles).map(([name, p]) => ({
      name,
      provider: p.baseUrl ? new URL(p.baseUrl).hostname.replace(/^api\./, '') : p.type,
      model: p.model,
      active: name === cfg.activeProfile,
      hasKey: usable(p),
      keyHint: p.apiKey ? maskKey(p.apiKey) : resolveApiKey(p) ? 'from environment' : '',
      keySource: p.apiKey ? 'saved' : resolveApiKey(p) ? 'env' : 'none',
      local: isLocalUrl(p.baseUrl),
      efforts: effortLevels(p.type, p.model) ?? [],
    })),
    workspaces: workspaces.map((p) => ({ path: p, name: path.basename(p) || p, missing: !isDir(p), instructions: instructionFiles(p), chats: chatsFor(p) })),
    chats: plainChats(),
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
  const rt: Runtime = { session, permissions: new Permissions(cfg.permissionMode) }
  runtimes.set(id, rt)
  return rt
}

function startTurn(chatId: string, rt: Runtime, text: string) {
  const { session } = rt
  const messages = session.messages
  const before = messages.length
  const plain = session.kind === 'chat'
  // "/init" sends the long research prompt; the chat only ever shows "/init".
  const init = !plain && /^\/init(\s|$)/.test(text.trim())
  messages.push(init ? { role: 'user', content: `${INIT_PROMPT}${text.trim().slice(5) ? `\n\nExtra guidance: ${text.trim().slice(5).trim()}` : ''}`, display: text.trim() } : { role: 'user', content: text })
  const ac = (rt.abort = new AbortController())
  const t0 = Date.now()
  const active = activeProfile()
  session.profile = active?.[0] ?? 'demo'

  const run = async () => {
    try {
      const provider = demo ? demoProvider() : createProvider(active![1])
      await runTurn({
        provider,
        system: plain ? buildChatPrompt() : buildSystemPrompt(session.cwd),
        messages,
        cwd: session.cwd,
        permissions: rt.permissions,
        signal: ac.signal,
        effort: cfg.effort,
        tools: plain ? [] : undefined,
        hooks: {
          onThinking: () => emit({ chatId, type: 'thinking' }),
          onReasoning: (delta) => emit({ chatId, type: 'reasoning', delta }),
          onText: (delta) => emit({ chatId, type: 'text', delta }),
          onTextEnd: () => emit({ chatId, type: 'textEnd' }),
          onToolRunning: (name, summary) => emit({ chatId, type: 'toolRunning', name, summary }),
          onToolDone: (name, summary, ok, result) => emit({ chatId, type: 'toolDone', name, summary, ok, result: clip(result) }),
          confirm: (name, preview) =>
            new Promise((resolve) => {
              const id = Math.random().toString(36).slice(2)
              rt.pending = { id, resolve }
              emit({ chatId, type: 'confirm', id, name, summary: preview.kind === 'diff' ? preview.path : preview.kind === 'command' ? preview.command : preview.summary, preview: toPreviewDto(preview) })
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
        saved.set(session.id, { id: session.id, cwd: session.cwd, title: session.title ?? titleFrom(messages), updatedAt: session.updatedAt, kind: session.kind === 'chat' ? 'chat' : 'code' })
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
  persist()
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

  ipcMain.handle('chat:new', (_e, cwd: string, kind: ChatKind) => {
    const folder = kind === 'chat' ? '' : cwd
    // Reuse an empty chat instead of piling up blanks.
    for (const [id, rt] of runtimes) if ((rt.session.kind === 'chat') === (kind === 'chat') && rt.session.cwd === folder && !rt.session.messages.length) return id
    const session = newSession(folder, activeProfile()?.[0] ?? 'demo', kind)
    runtimes.set(session.id, { session, permissions: new Permissions(cfg.permissionMode) })
    pushState()
    return session.id
  })
  ipcMain.handle('chat:open', (_e, id: string) => {
    const rt = runtime(id)
    return rt ? { cwd: rt.session.cwd, kind: rt.session.kind === 'chat' ? ('chat' as const) : ('code' as const), title: titleFrom(rt.session.messages), items: toItems(rt.session.messages) } : null
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
    if (rt.session.kind !== 'chat' && !isDir(rt.session.cwd)) return { ok: false, error: `The folder ${rt.session.cwd} no longer exists.` }
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
    persist()
    pushState()
  })
  ipcMain.handle('profile:remove', (_e, name: string) => {
    const { [name]: _gone, ...rest } = cfg.profiles
    cfg = { ...cfg, profiles: rest, activeProfile: cfg.activeProfile === name ? (Object.keys(rest)[0] ?? '') : cfg.activeProfile }
    persist()
    pushState()
  })
  ipcMain.handle('effort:set', (_e, effort: Effort) => {
    if (!EFFORTS.includes(effort)) return
    cfg = { ...cfg, effort }
    persist()
    pushState()
  })
  ipcMain.handle('mode:set', (_e, mode: PermissionMode) => {
    if (!['manual', 'auto', 'bypass'].includes(mode)) return
    cfg = { ...cfg, permissionMode: mode }
    for (const rt of runtimes.values()) rt.permissions.mode = mode
    persist()
    pushState()
  })

  ipcMain.handle('models:list', async (_e, name?: string) => {
    const key = name ?? cfg.activeProfile
    const p = cfg.profiles[key]
    if (demo && !name) return { models: [{ id: 'demo (no API)' }] }
    if (!p) return { models: [], error: 'No provider selected.' }
    const cacheKey = `${key}|${p.baseUrl ?? ''}|${p.apiKey ?? ''}`
    const hit = modelCache.get(cacheKey)
    if (hit && Date.now() - hit.at < 5 * 60_000 && !hit.value.error) return hit.value
    const value = await listModels(p)
    modelCache.set(cacheKey, { at: Date.now(), value })
    return value
  })
  ipcMain.handle('models:set', (_e, name: string, model: string) => {
    const p = cfg.profiles[name]
    if (!p || !model.trim()) return
    cfg = { ...cfg, profiles: { ...cfg.profiles, [name]: { ...p, model: model.trim() } } }
    persist()
    pushState()
  })
  ipcMain.handle('profile:key', async (_e, name: string, apiKey: string): Promise<Result> => {
    const p = cfg.profiles[name]
    if (!p) return { ok: false, error: 'That provider no longer exists.' }
    if (!apiKey.trim()) return { ok: false, error: 'Paste the new key first.' }
    const next: Profile = { ...p, apiKey: apiKey.trim() }
    delete next.apiKeyEnc
    const check = await checkProfile(next)
    if (check.error) return { ok: false, error: check.error }
    cfg = { ...cfg, profiles: { ...cfg.profiles, [name]: next } }
    modelCache.clear()
    persist()
    pushState()
    return { ok: true }
  })

  // Files for the side panel. Only folders that were added to the sidebar can be read.
  const inWorkspace = (cwd: string) => {
    if (!workspaces.includes(cwd)) throw new Error('Not a known folder.')
  }
  ipcMain.handle('fs:list', (_e, cwd: string, rel: string): FsEntry[] => {
    inWorkspace(cwd)
    const root = fs.realpathSync(cwd)
    const dir = safePath(cwd, rel || '.')
    const ig = new Ignore()
    let walkDir = root
    ig.addDir(root, root)
    for (const part of path.relative(root, dir).split(path.sep).filter(Boolean)) {
      walkDir = path.join(walkDir, part)
      ig.addDir(walkDir, root)
    }
    const out: FsEntry[] = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === '.DS_Store' || e.name === 'node_modules') continue
      const r = path.relative(root, path.join(dir, e.name)).split(path.sep).join('/')
      const isD = e.isDirectory()
      if (!isD && !e.isFile()) continue
      if (ig.ignored(r, isD)) continue
      out.push({ name: e.name, rel: r, dir: isD })
    }
    return out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
  })
  ipcMain.handle('fs:read', (_e, cwd: string, rel: string): FsFile | null => {
    inWorkspace(cwd)
    const abs = safePath(cwd, rel)
    const stat = fs.statSync(abs)
    if (!stat.isFile()) return null
    const ext = path.extname(abs).slice(1).toLowerCase()
    const mime = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp' } as Record<string, string>)[ext]
    if (mime) return stat.size > 5_000_000 ? { rel, kind: 'binary', size: stat.size } : { rel, kind: 'image', size: stat.size, dataUrl: `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}` }
    const MAX = 400_000
    const fd = fs.openSync(abs, 'r')
    const buf = Buffer.alloc(Math.min(stat.size, MAX))
    fs.readSync(fd, buf, 0, buf.length, 0)
    fs.closeSync(fd)
    if (buf.subarray(0, 8000).includes(0)) return { rel, kind: 'binary', size: stat.size }
    return { rel, kind: 'text', size: stat.size, text: buf.toString('utf8'), truncated: stat.size > MAX }
  })
  ipcMain.handle('fs:reveal', (_e, cwd: string, rel: string) => {
    inWorkspace(cwd)
    shell.showItemInFolder(safePath(cwd, rel || '.'))
  })
  // Git and "run this snippet" act on a known folder only.
  ipcMain.handle('git:status', (_e, cwd: string) => (inWorkspace(cwd), gitStatus(cwd)))
  ipcMain.handle('git:diff', (_e, cwd: string, file: string, untracked: boolean) => (inWorkspace(cwd), safePath(cwd, file), gitDiff(cwd, file, untracked)))
  ipcMain.handle('git:commit', (_e, cwd: string, paths: string[], message: string) => (inWorkspace(cwd), paths.forEach((p) => safePath(cwd, p)), gitCommit(cwd, paths, message)))
  ipcMain.handle('git:push', (_e, cwd: string, hasUpstream: boolean) => (inWorkspace(cwd), gitPush(cwd, hasUpstream)))
  ipcMain.handle('git:pull', (_e, cwd: string) => (inWorkspace(cwd), gitPull(cwd)))
  ipcMain.handle('git:init', (_e, cwd: string) => (inWorkspace(cwd), gitInit(cwd)))
  ipcMain.handle('git:connect', (_e, cwd: string, remote: string) => (inWorkspace(cwd), gitConnect(cwd, remote)))
  ipcMain.handle('git:publish', (_e, cwd: string, name: string, isPrivate: boolean) => (inWorkspace(cwd), gitPublish(cwd, name, !!isPrivate)))
  ipcMain.handle('run:start', (_e, cwd: string, kind: RunKind, code: string) => {
    inWorkspace(cwd)
    if (!['shell', 'python', 'node'].includes(kind) || typeof code !== 'string' || code.length > 200_000) throw new Error('Cannot run that.')
    return runner.start(cwd, kind, code, (id, data) => send('run:data', { id, data }), (e) => send('run:exit', e))
  })
  ipcMain.on('run:stop', (_e, id: string) => runner.stop(id))

  ipcMain.handle('browser:ports', async () => {
    const probe = (port: number) =>
      new Promise<number | null>((resolve) => {
        const sock = net.connect({ port, host: '127.0.0.1', timeout: 250 })
        sock.once('connect', () => (sock.destroy(), resolve(port)))
        sock.once('timeout', () => (sock.destroy(), resolve(null)))
        sock.once('error', () => resolve(null))
      })
    const found = await Promise.all([3000, 3001, 4200, 4321, 5000, 5173, 5174, 8000, 8080, 8888].map(probe))
    return found.filter((p): p is number => p !== null)
  })
  ipcMain.handle('shell:open', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  ipcMain.handle('term:create', (_e, cwd: string, cols: number, rows: number) =>
    terminals.create(cwd, cols, rows, (id, data) => send('term:data', { id, data }), (id) => send('term:exit', { id })),
  )
  ipcMain.on('term:write', (_e, id: string, data: string) => terminals.write(id, data))
  ipcMain.on('term:resize', (_e, id: string, cols: number, rows: number) => terminals.resize(id, cols, rows))
  ipcMain.on('term:kill', (_e, id: string) => terminals.kill(id))

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
      webviewTag: true,
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
  // The in-app browser is a <webview>. Lock it down: no preload, no node, web URLs only.
  win.webContents.on('will-attach-webview', (e, prefs, params) => {
    delete prefs.preload
    prefs.nodeIntegration = false
    prefs.contextIsolation = true
    prefs.sandbox = true
    if (!/^(https?:|about:blank)/i.test(params.src ?? '')) e.preventDefault()
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
        { label: 'Toggle Terminal', accelerator: 'CmdOrCtrl+J', click: cmd('toggleTerminal') },
        { label: 'Toggle Files', accelerator: 'CmdOrCtrl+Shift+E', click: cmd('toggleFiles') },
        { label: 'Toggle Browser', accelerator: 'CmdOrCtrl+Shift+B', click: cmd('toggleBrowser') },
        { label: 'Toggle Git', accelerator: 'CmdOrCtrl+Shift+G', click: cmd('toggleGit') },
        { type: 'separator' },
        { label: 'Chat Mode', accelerator: 'CmdOrCtrl+1', click: cmd('modeChat') },
        { label: 'Code Mode', accelerator: 'CmdOrCtrl+2', click: cmd('modeCode') },
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

// Pages in the in-app browser that try to open a new window load in place instead.
app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void contents.loadURL(url)
    return { action: 'deny' }
  })
})

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
    terminals.killAll()
    runner.stopAll()
  })
}
