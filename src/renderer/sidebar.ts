import type { ChatInfo, WorkspaceInfo } from '../shared/ipc.js'
import { h, icon } from './dom.js'
import { bus, croo, installUpdate, onUpdateProgress, remember, store, updateProgress } from './store.js'

const collapsed = new Set<string>(JSON.parse(remember.get('collapsed') ?? '[]'))

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

/** "Croo 0.7.0 is out": bottom left, until you get it or wave it away. */
function updateBanner(): HTMLElement | null {
  const u = store.state.update
  if (!u || remember.get('dismissedUpdate') === u.version) return null
  const idle = u.zip ? 'Click to update' : 'Click to download'
  const small = h('small', null, idle)
  const fill = h('div', { class: 'update-fill' })
  const main = h('button', { class: 'update-main no-drag', type: 'button', onClick: async () => {
    if (!u.zip) small.textContent = 'Opening download…'
    const err = await installUpdate()
    if (err) small.textContent = err
    else if (!u.zip) small.textContent = idle
  } }, icon('download', 15), h('span', { class: 'update-text' }, h('b', null, `Croo ${u.version} is out`), small))
  const dismiss = h('button', { class: 'row-btn show no-drag', type: 'button', title: 'Not now', onClick: () => (remember.set('dismissedUpdate', u.version), renderSidebar()) }, icon('x', 13))
  const banner = h('div', { class: 'update', 'data-tip': u.notes ? u.notes.split('\n').filter(Boolean).slice(0, 3).join(' · ').slice(0, 160) : 'A newer version is available' }, main, dismiss, fill)
  // The sidebar is rebuilt often, so the banner paints from the shared progress rather than keeping its own.
  const paint = () => {
    const p = updateProgress
    banner.classList.toggle('busy', !!p)
    main.toggleAttribute('disabled', !!p)
    dismiss.style.display = p ? 'none' : ''
    if (p) small.textContent = p.text
    fill.style.width = p?.fraction !== undefined ? `${p.fraction * 100}%` : '0'
    fill.classList.toggle('indeterminate', !!p && p.fraction === undefined)
  }
  paint()
  const stop = onUpdateProgress(() => (banner.isConnected ? paint() : stop()))
  return banner
}

function segmented(): HTMLElement {
  const btn = (kind: 'chat' | 'code', label: string, key: string) =>
    h('button', { class: `seg-btn no-drag ${store.mode === kind ? 'on' : ''}`, type: 'button', role: 'tab', 'aria-selected': store.mode === kind, title: `${label} (${key})`, onClick: () => bus.mode(kind) }, icon(kind === 'chat' ? 'message' : 'code', 16))
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
    h('div', { class: 'sb-top drag' }, segmented(), h('span', { class: 'push-right' }), h('button', { class: 'icon-btn no-drag', type: 'button', title: 'Search (⌘K)', onClick: () => bus.command('search') }, icon('search', 16)), h('button', { class: 'icon-btn no-drag', type: 'button', title: 'Hide sidebar (⌘B)', onClick: () => document.getElementById('app')?.classList.add('sidebar-hidden') }, icon('sidebar', 17))),
    list,
    ...(updateBanner() ? [updateBanner()!] : []),
    h('div', { class: 'sb-foot' }, store.state.avatar ? h('img', { class: 'avatar', src: store.state.avatar, alt: '' }) : h('span', { class: 'avatar blank' }, (store.state.userName || 'U').trim().slice(0, 1).toUpperCase()), h('span', { class: 'brand' }, store.state.userName || 'User'), h('button', { class: 'icon-btn no-drag', type: 'button', title: 'Settings (⌘,)', onClick: () => bus.settings() }, icon('gear', 17))),
  )
  list.scrollTop = scrollTop
}
