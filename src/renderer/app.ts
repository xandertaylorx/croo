import type { AppState, ChatKind, Command } from '../shared/ipc.js'
import { answerPending, currentChat, focusComposer, handleEvent, initRuns, refreshHeader, refreshMode, refreshVoice, showChat } from './chat.js'
import { h, icon } from './dom.js'
import { Frog } from './frog.js'
import { renderOnboarding, openSettings, refreshLocalCards, refreshSettings } from './setup.js'
import { closeSide, initSide, setFolder } from './side.js'
import { renderSidebar } from './sidebar.js'
import { clearTerminal, closeTerminal, initTerminal, newTab, stepTab, terminalFocused, toggleTerminal } from './terminal.js'
import { openPalette } from './palette.js'
import { initTooltips } from './tooltip.js'
import { bus, croo, remember, store, type ChatView } from './store.js'

const main = () => document.getElementById('pane')!
let mode = ''

// ---------- chats ----------

async function openChat(id: string) {
  let view = store.views.get(id)
  if (!view) {
    const r = await croo.openChat(id)
    if (!r) return
    view = { id, kind: r.kind, cwd: r.cwd, items: r.items, status: 'idle', label: '', draft: '', context: r.context, checkpoints: r.checkpoints } satisfies ChatView
    store.views.set(id, view)
  }
  if (view.kind !== store.mode) setMode(view.kind, false)
  store.active = id
  remember.set(`lastChat.${view.kind}`, id)
  mode = ''
  renderMain()
  renderSidebar()
}

async function newChat(cwd: string, kind: ChatKind) {
  await openChat(await croo.newChat(cwd, kind))
}

/** The folder new code chats should go in: the current chat's, else the first one. */
const currentFolder = () => (currentChat()?.kind === 'code' ? currentChat()!.cwd : undefined) ?? store.state.workspaces[0]?.path

function setMode(kind: ChatKind, render = true) {
  if (store.mode === kind && !render) return
  store.mode = kind
  remember.set('mode', kind)
  document.getElementById('app')!.dataset.mode = kind
  if (kind === 'chat') {
    closeTerminal()
    closeSide()
  }
  const view = store.active ? store.views.get(store.active) : undefined
  if (view && view.kind !== kind) store.active = null
  if (!render) return
  mode = ''
  renderSidebar()
  renderMain()
}

// ---------- main pane ----------

function renderMain() {
  const s = store.state
  const view = store.active ? store.views.get(store.active) : undefined
  const usable = view && view.kind === store.mode ? view : undefined
  const next = !s.ready ? 'onboarding' : store.mode === 'code' && !s.workspaces.length ? 'no-folder' : usable ? `chat:${usable.id}` : 'pick'
  if (next === mode) return
  mode = next

  setFolder(usable?.kind === 'code' ? usable.cwd : undefined)
  if (next === 'onboarding') renderOnboarding(main())
  else if (next === 'no-folder') main().replaceChildren(emptyFolder())
  else if (usable) showChat(usable, main())
  else void pickChat()
}

function emptyFolder(): HTMLElement {
  return h(
    'section',
    { class: 'onboarding' },
    h('div', { class: 'chat-head drag' }),
    h(
      'div',
      { class: 'onboarding-body' },
      new Frog(168).el,
      h('h1', null, 'Pick a folder to work in'),
      h('p', { class: 'lede' }, 'Each folder gets its own chats. Drop one here, or choose it.'),
      h('button', { class: 'btn primary big', type: 'button', onClick: () => void croo.addWorkspace() }, icon('folder', 15), 'Add a folder'),
      h('button', { class: 'link', type: 'button', onClick: () => setMode('chat') }, 'Or just chat, no folder needed'),
    ),
  )
}

/** Nothing selected yet: reopen the last chat for this mode, else the newest one, else start one. */
async function pickChat() {
  const kind = store.mode
  const chats = kind === 'chat' ? store.state.chats : store.state.workspaces.flatMap((w) => w.chats)
  const last = remember.get(`lastChat.${kind}`)
  const target = chats.find((c) => c.id === last) ?? [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (target) await openChat(target.id)
  else await newChat(kind === 'chat' ? '' : store.state.workspaces[0].path, kind)
}

// ---------- state ----------

function onState(next: AppState) {
  const before = store.state
  store.state = next

  // A folder was just added: jump straight into a chat there.
  const added = next.workspaces.find((w) => !before.workspaces.some((b) => b.path === w.path))
  const known = (id: string | null) => !!id && [...next.workspaces.flatMap((w) => w.chats), ...next.chats].some((c) => c.id === id)
  if (store.active && !known(store.active)) {
    store.views.delete(store.active)
    store.active = null
    mode = ''
  }
  if (before.ready !== next.ready) mode = ''
  renderSidebar()
  refreshHeader()
  refreshMode()
  refreshSettings()
  refreshLocalCards()
  refreshVoice()
  if (added && !added.missing && next.ready && before.workspaces.length && store.mode === 'code') void newChat(added.path, 'code')
  else renderMain()
}

// ---------- boot ----------

document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return
  if (e.key === 'Enter' && answerPending('y')) e.preventDefault()
  // ⌘T opens a new terminal tab, but only while the terminal is the thing you are in.
  if (e.metaKey && !e.shiftKey && e.key === 't' && terminalFocused()) {
    e.preventDefault()
    void newTab()
  }
  if (e.metaKey && e.shiftKey && (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}') && terminalFocused()) {
    e.preventDefault()
    stepTab(e.key === '[' || e.key === '{' ? -1 : 1)
  }
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.querySelector('.modal, .mode-menu, .model-menu, .slash-menu') && answerPending('n')) e.preventDefault()
})

async function boot() {
  bus.sidebar = renderSidebar
  bus.main = renderMain
  bus.openChat = openChat
  bus.newChat = newChat
  bus.settings = openSettings
  bus.terminal = () => store.mode === 'code' && toggleTerminal()
  bus.mode = setMode

  const first = await croo.getState()
  document.documentElement.dataset.platform = first.platform
  store.state = first
  store.mode = remember.get('mode') === 'chat' ? 'chat' : 'code'
  document.getElementById('app')!.dataset.mode = store.mode
  if (remember.get('sidebar') === 'hidden') document.getElementById('app')!.classList.add('sidebar-hidden')

  initTooltips()
  initRuns()
  initSide()
  initTerminal({ getCwd: currentFolder })
  croo.onState(onState)
  croo.onEvent(handleEvent)
  const runCommand = (c: Command) => {
    const app = document.getElementById('app')!
    if (c === 'newChat') {
      const cwd = currentFolder()
      if (store.mode === 'chat') void newChat('', 'chat')
      else if (cwd) void newChat(cwd, 'code')
      else void croo.addWorkspace()
    } else if (c === 'addFolder') void croo.addWorkspace()
    else if (c === 'search') terminalFocused() ? clearTerminal() : openPalette()
    else if (c === 'settings') openSettings()
    else if (c === 'toggleTerminal') bus.terminal()
    else if (c === 'toggleFiles') store.mode === 'code' && bus.files()
    else if (c === 'toggleBrowser') store.mode === 'code' && bus.browser()
    else if (c === 'toggleGit') store.mode === 'code' && bus.git()
    else if (c === 'modeChat') setMode('chat')
    else if (c === 'modeCode') setMode('code')
    else if (c === 'toggleSidebar') {
      app.classList.toggle('sidebar-hidden')
      remember.set('sidebar', app.classList.contains('sidebar-hidden') ? 'hidden' : 'shown')
      if (!app.classList.contains('sidebar-hidden')) focusComposer()
    }
  }
  bus.command = runCommand
  croo.onCommand(runCommand)
  croo.onOpenChat((id) => void openChat(id))

  renderSidebar()
  renderMain()
}

void boot()
