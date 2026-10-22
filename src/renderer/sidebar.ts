import type { ChatInfo, WorkspaceInfo } from '../shared/ipc.js'
import { h, icon } from './dom.js'
import { Frog } from './frog.js'
import { bus, croo, remember, store } from './store.js'

const collapsed = new Set<string>(JSON.parse(remember.get('collapsed') ?? '[]'))
const footFrog = new Frog(42)

function toggle(path: string) {
  collapsed.has(path) ? collapsed.delete(path) : collapsed.add(path)
  remember.set('collapsed', JSON.stringify([...collapsed]))
  renderSidebar()
}

const onEnter = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' && e.target === e.currentTarget) fn()
}

function chatRow(c: ChatInfo): HTMLElement {
  let armed = false
  const del = h(
    'button',
    {
      class: 'row-btn danger no-drag',
      type: 'button',
      title: 'Delete chat',
      onClick: (e: Event) => {
        e.stopPropagation()
        if (!armed) {
          armed = true
          del.classList.add('armed')
          del.replaceChildren('Delete?')
          return
        }
        void croo.deleteChat(c.id)
      },
    },
    icon('trash', 13),
  )
  const open = () => void bus.openChat(c.id)
  const row = h(
    'div',
    { class: `chat-row no-drag ${store.active === c.id ? 'active' : ''}`, role: 'button', tabindex: 0, onClick: open, onKeydown: onEnter(open) },
    c.running ? h('span', { class: 'dot', title: 'Working' }) : null,
    h('span', { class: 'chat-name' }, c.title),
    del,
  )
  row.addEventListener('mouseleave', () => {
    if (!armed) return
    armed = false
    del.classList.remove('armed')
    del.replaceChildren(icon('trash', 13))
  })
  return row
}

function segmented(): HTMLElement {
  const btn = (kind: 'chat' | 'code', label: string, key: string) =>
    h('button', { class: `seg-btn no-drag ${store.mode === kind ? 'on' : ''}`, type: 'button', role: 'tab', 'aria-selected': store.mode === kind, title: `${label} (${key})`, onClick: () => bus.mode(kind) }, icon(kind === 'chat' ? 'message' : 'code', 14), label)
  return h('div', { class: 'seg', role: 'tablist' }, btn('chat', 'Chat', '⌘1'), btn('code', 'Code', '⌘2'))
}

function workspace(w: WorkspaceInfo): HTMLElement {
  const open = !collapsed.has(w.path)
  const flip = () => toggle(w.path)
  return h(
    'section',
    { class: `ws ${open ? 'open' : ''}` },
    h(
      'div',
      { class: 'ws-head no-drag', role: 'button', tabindex: 0, title: w.path, onClick: flip, onKeydown: onEnter(flip) },
      icon('chevron', 12),
      icon('folder', 15),
      h('span', { class: 'ws-name' }, w.name),
      h('button', { class: 'row-btn no-drag', type: 'button', title: 'Remove folder from sidebar', onClick: (e: Event) => (e.stopPropagation(), void croo.removeWorkspace(w.path)) }, icon('x', 13)),
      h('button', { class: 'row-btn no-drag', type: 'button', title: 'New chat (⌘N)', disabled: w.missing, onClick: (e: Event) => (e.stopPropagation(), void bus.newChat(w.path, 'code')) }, icon('plus', 14)),
    ),
    open
      ? h(
          'div',
          { class: 'ws-chats' },
          w.missing ? h('div', { class: 'ws-empty' }, 'Folder not found') : null,
          w.chats.map(chatRow),
          !w.missing && !w.chats.length ? h('div', { class: 'ws-empty' }, 'No chats yet') : null,
        )
      : null,
  )
}

export function renderSidebar() {
  const root = document.getElementById('sidebar')!
  const scrollTop = root.querySelector<HTMLElement>('.sb-list')?.scrollTop ?? 0
  const { workspaces, chats } = store.state
  const anyRunning = [...workspaces.flatMap((w) => w.chats), ...chats].some((c) => c.running)
  footFrog.set(anyRunning ? 'working' : 'idle')

  const plain = store.mode === 'chat'
  const list = h(
    'div',
    { class: 'sb-list' },
    ...(plain
      ? [
          h('div', { class: 'sb-label' }, h('span', null, 'Chats'), h('button', { class: 'row-btn show no-drag', type: 'button', title: 'New chat (⌘N)', onClick: () => void bus.newChat('', 'chat') }, icon('plus', 14))),
          chats.length ? h('div', { class: 'plain-chats' }, chats.map(chatRow)) : h('div', { class: 'ws-empty flush' }, 'No chats yet. Say hi.'),
        ]
      : [
          h('div', { class: 'sb-label' }, h('span', null, 'Folders'), h('button', { class: 'row-btn show no-drag', type: 'button', title: 'Add folder (⌘O)', onClick: () => void croo.addWorkspace() }, icon('plus', 14))),
          ...(workspaces.length
            ? workspaces.map(workspace)
            : [h('button', { class: 'add-folder no-drag', type: 'button', onClick: () => void croo.addWorkspace() }, icon('folder', 15), 'Add a folder')]),
        ]),
  )

  root.replaceChildren(
    h('div', { class: 'sb-top drag' }, segmented(), h('button', { class: 'icon-btn no-drag', type: 'button', title: 'Hide sidebar (⌘B)', onClick: () => document.getElementById('app')?.classList.add('sidebar-hidden') }, icon('sidebar', 17))),
    list,
    h('div', { class: 'sb-foot' }, footFrog.el, h('span', { class: 'brand' }, 'Croo'), h('button', { class: 'icon-btn no-drag', type: 'button', title: 'Settings (⌘,)', onClick: () => bus.settings() }, icon('gear', 17))),
  )
  list.scrollTop = scrollTop
}
