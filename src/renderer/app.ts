import type { AppState } from '../shared/ipc.js'
import { answerPending, currentChat, focusComposer, handleEvent, refreshHeader, showChat } from './chat.js'
import { h, icon } from './dom.js'
import { Frog } from './frog.js'
import { renderOnboarding, openSettings, refreshSettings } from './setup.js'
import { renderSidebar } from './sidebar.js'
import { bus, croo, remember, store, type ChatView } from './store.js'

const main = () => document.getElementById('main')!
let mode = ''

// ---------- chats ----------

async function openChat(id: string) {
  let view = store.views.get(id)
  if (!view) {
    const r = await croo.openChat(id)
    if (!r) return
    view = { id, cwd: r.cwd, items: r.items, status: 'idle', label: '', draft: '' } satisfies ChatView
    store.views.set(id, view)
  }
  store.active = id
  remember.set('lastChat', id)
  mode = ''
  renderMain()
  renderSidebar()
}

async function newChat(cwd: string) {
  await openChat(await croo.newChat(cwd))
}

/** The folder new chats should go in: the current chat's, else the first one. */
const currentFolder = () => currentChat()?.cwd ?? store.state.workspaces[0]?.path

// ---------- main pane ----------

function renderMain() {
  const s = store.state
  const view = store.active ? store.views.get(store.active) : undefined
  const next = !s.ready ? 'onboarding' : !s.workspaces.length ? 'no-folder' : view ? `chat:${view.id}` : 'pick'
  if (next === mode) return
  mode = next

  if (next === 'onboarding') renderOnboarding(main())
  else if (next === 'no-folder') main().replaceChildren(emptyFolder())
  else if (view) showChat(view, main())
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
      new Frog(96).el,
      h('h1', null, 'Pick a folder to work in'),
      h('p', { class: 'lede' }, 'Each folder gets its own chats. Drop one here, or choose it.'),
      h('button', { class: 'btn primary big', type: 'button', onClick: () => void croo.addWorkspace() }, icon('folder', 15), 'Add a folder'),
    ),
  )
}

/** Nothing selected yet: reopen the last chat, else the newest one, else start one. */
async function pickChat() {
  const chats = store.state.workspaces.flatMap((w) => w.chats)
  const last = remember.get('lastChat')
  const target = chats.find((c) => c.id === last) ?? [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (target) await openChat(target.id)
  else await newChat(store.state.workspaces[0].path)
}

// ---------- state ----------

function onState(next: AppState) {
  const before = store.state
  store.state = next

  // A folder was just added: jump straight into a chat there.
  const added = next.workspaces.find((w) => !before.workspaces.some((b) => b.path === w.path))
  const known = (id: string | null) => !!id && next.workspaces.some((w) => w.chats.some((c) => c.id === id))
  if (store.active && !known(store.active)) {
    store.views.delete(store.active)
    store.active = null
    mode = ''
  }
  if (before.ready !== next.ready) mode = ''
  renderSidebar()
  refreshHeader()
  refreshSettings()
  if (added && !added.missing && next.ready && before.workspaces.length) void newChat(added.path)
  else renderMain()
}

// ---------- boot ----------

document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey)) return
  if (e.key === 'Enter' && answerPending('y')) e.preventDefault()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.querySelector('.modal') && answerPending('n')) e.preventDefault()
})

async function boot() {
  bus.sidebar = renderSidebar
  bus.main = renderMain
  bus.openChat = openChat
  bus.newChat = newChat
  bus.settings = openSettings

  document.documentElement.dataset.platform = (await croo.getState()).platform
  store.state = await croo.getState()
  if (remember.get('sidebar') === 'hidden') document.getElementById('app')!.classList.add('sidebar-hidden')

  croo.onState(onState)
  croo.onEvent(handleEvent)
  croo.onCommand((c) => {
    if (c === 'newChat') {
      const cwd = currentFolder()
      if (cwd) void newChat(cwd)
      else void croo.addWorkspace()
    } else if (c === 'addFolder') void croo.addWorkspace()
    else if (c === 'settings') openSettings()
    else if (c === 'toggleSidebar') {
      const app = document.getElementById('app')!
      app.classList.toggle('sidebar-hidden')
      remember.set('sidebar', app.classList.contains('sidebar-hidden') ? 'hidden' : 'shown')
      if (!app.classList.contains('sidebar-hidden')) focusComposer()
    }
  })

  renderSidebar()
  renderMain()
}

void boot()
