import type { ChatHit } from '../chatsearch.js'
import { h, icon, type IconName } from './dom.js'
import { openFileInPanel } from './side.js'
import { bus, croo, store } from './store.js'

interface Row {
  key: string
  section: 'Chats' | 'Files' | 'Actions'
  icon: IconName
  title: string
  sub?: string
  keys?: string
  run: () => void
}

let root: HTMLElement | null = null

export function closePalette() {
  root?.remove()
  root = null
  document.removeEventListener('keydown', onKey, true)
}

let move: (d: number) => void = () => {}
let choose: () => void = () => {}
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') (e.stopPropagation(), closePalette())
  else if (e.key === 'ArrowDown') (e.preventDefault(), move(1))
  else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1))
  else if (e.key === 'Enter' && !e.isComposing) (e.preventDefault(), choose())
}

const actions = (): Row[] => {
  const code = store.mode === 'code'
  const a = (title: string, ic: IconName, keys: string, run: () => void): Row => ({ key: `a:${title}`, section: 'Actions', icon: ic, title, keys, run })
  return [
    a('New chat', 'plus', '⌘N', () => bus.command('newChat')),
    a('Settings', 'gear', '⌘,', () => bus.settings()),
    a('Chat mode', 'message', '⌘1', () => bus.mode('chat')),
    a('Code mode', 'code', '⌘2', () => bus.mode('code')),
    ...(code
      ? [
          a('Add folder', 'folder', '⌘O', () => void croo.addWorkspace()),
          a('Toggle files', 'folder', '⌘⇧E', () => bus.files()),
          a('Toggle git', 'branch', '⌘⇧G', () => bus.git()),
          a('Toggle browser', 'globe', '⌘⇧B', () => bus.browser()),
          a('Toggle terminal', 'terminal', '⌘J', () => bus.terminal()),
        ]
      : []),
  ]
}

export function openPalette() {
  if (root) return closePalette()
  let rows: Row[] = []
  let index = 0
  let ticket = 0
  const input = h('input', { class: 'palette-input', placeholder: 'Search chats, files and actions…', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Search' })
  const list = h('div', { class: 'palette-list', role: 'listbox' })
  const cwd = store.mode === 'code' ? (store.active ? store.views.get(store.active)?.cwd : undefined) ?? store.state.workspaces[0]?.path : undefined

  const paint = () => {
    index = Math.min(index, Math.max(rows.length - 1, 0))
    const out: HTMLElement[] = []
    let last = ''
    rows.forEach((r, i) => {
      if (r.section !== last) (out.push(h('div', { class: 'palette-section' }, r.section)), (last = r.section))
      out.push(
        h(
          'button',
          { class: `palette-row ${i === index ? 'on' : ''}`, type: 'button', role: 'option', 'aria-selected': i === index, onMousemove: () => i !== index && ((index = i), paint()), onClick: () => (closePalette(), r.run()) },
          icon(r.icon, 15),
          h('span', { class: 'palette-text' }, h('b', null, r.title), r.sub ? h('small', null, r.sub) : null),
          r.keys ? h('span', { class: 'palette-keys' }, [...(r.keys.match(/⌘|⇧|⌥|⌃|[A-Za-z0-9,]+/g) ?? [])].map((k) => h('kbd', null, k))) : null,
        ),
      )
    })
    list.replaceChildren(...(out.length ? out : [h('div', { class: 'palette-empty' }, 'No matches.')]))
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }

  const chatRow = (c: ChatHit): Row => ({
    key: `c:${c.id}`,
    section: 'Chats',
    icon: c.kind === 'chat' ? 'message' : 'code',
    title: c.title,
    sub: c.snippet ?? (c.kind === 'chat' ? 'Chat' : c.cwd.split('/').filter(Boolean).pop()),
    run: () => void bus.openChat(c.id),
  })

  const search = async () => {
    const q = input.value.trim()
    const mine = ++ticket
    const [chats, files] = await Promise.all([croo.searchChats(q), cwd && q ? croo.searchFiles(cwd, q) : Promise.resolve([] as string[])])
    if (mine !== ticket || !root) return
    const lower = q.toLowerCase()
    rows = [
      ...chats.slice(0, q ? 8 : 6).map(chatRow),
      ...files.slice(0, 8).map<Row>((rel) => ({ key: `f:${rel}`, section: 'Files', icon: 'file', title: rel.split('/').pop() ?? rel, sub: rel.includes('/') ? rel : undefined, run: () => openFileInPanel(rel) })),
      ...actions().filter((a) => !lower || a.title.toLowerCase().includes(lower)),
    ]
    index = 0
    paint()
  }

  move = (d) => ((index = (index + d + Math.max(rows.length, 1)) % Math.max(rows.length, 1)), paint())
  choose = () => rows[index] && (closePalette(), rows[index].run())
  let timer = 0
  input.addEventListener('input', () => (clearTimeout(timer), (timer = window.setTimeout(() => void search(), 90))))

  root = h('div', { class: 'modal palette', onMousedown: (e: Event) => e.target === root && closePalette() }, h('div', { class: 'palette-card', role: 'dialog', 'aria-label': 'Search' }, h('div', { class: 'palette-bar' }, icon('search', 16), input, h('kbd', null, 'esc')), list))
  document.getElementById('modal-root')!.append(root)
  document.addEventListener('keydown', onKey, true)
  input.focus()
  void search()
}
