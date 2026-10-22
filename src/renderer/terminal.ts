import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'
import { h, icon } from './dom.js'
import { croo, remember } from './store.js'

interface Tab {
  id: string
  cwd: string
  title: string
  term: Terminal
  fit: FitAddon
  view: HTMLElement
}

const DARK: ITheme = {
  foreground: '#d9dfd9', cursor: '#5ed67e', cursorAccent: '#121513', selectionBackground: 'rgba(94,214,126,0.28)',
  black: '#2a2f2b', red: '#f06a60', green: '#5ed67e', yellow: '#e8b44a', blue: '#6cb0ff', magenta: '#c792ea', cyan: '#56d4c6', white: '#d9dfd9',
  brightBlack: '#6f7972', brightRed: '#ff8a80', brightGreen: '#8ae9a2', brightYellow: '#f3cb72', brightBlue: '#93c8ff', brightMagenta: '#dbb0f5', brightCyan: '#84e6dc', brightWhite: '#f2f5f2',
}
const LIGHT: ITheme = {
  foreground: '#232a25', cursor: '#1f9a4f', cursorAccent: '#f6f8f6', selectionBackground: 'rgba(31,154,79,0.22)',
  black: '#232a25', red: '#c8372d', green: '#1f8a45', yellow: '#9a6a00', blue: '#1f62c4', magenta: '#8f3fb5', cyan: '#127f77', white: '#d4dad5',
  brightBlack: '#6b756e', brightRed: '#d94b41', brightGreen: '#2aa357', brightYellow: '#b07c10', brightBlue: '#3a7ae0', brightMagenta: '#a758cc', brightCyan: '#1e9a91', brightWhite: '#f6f8f6',
}
const dark = matchMedia('(prefers-color-scheme: dark)')
const theme = (): ITheme => ({ ...(dark.matches ? DARK : LIGHT), background: getComputedStyle(document.documentElement).getPropertyValue('--term-bg').trim() || undefined })

const tabs: Tab[] = []
let active: Tab | null = null
let getCwd: () => string | undefined = () => undefined
let panel: HTMLElement
let tabsEl: HTMLElement
let body: HTMLElement
const early = new Map<string, string[]>() // output that arrives before its tab is registered

const isOpen = () => !panel.hidden
export const terminalFocused = () => isOpen() && panel.contains(document.activeElement)

function label(t: Tab): string {
  const title = t.title.includes(':') ? t.title.slice(t.title.lastIndexOf(':') + 1) : t.title
  const text = (title.trim() || t.cwd.split('/').filter(Boolean).pop() || 'shell').trim()
  return text.length > 22 ? '…' + text.slice(-21) : text
}

function renderTabs() {
  tabsEl.replaceChildren(
    ...tabs.map((t) =>
      h(
        'div',
        { class: `term-tab ${t === active ? 'active' : ''}`, role: 'tab', onMousedown: () => activate(t) },
        h('span', null, label(t)),
        h('button', { class: 'term-x', type: 'button', title: 'Close tab', onMousedown: (e: Event) => e.stopPropagation(), onClick: () => closeTab(t) }, icon('x', 12)),
      ),
    ),
  )
}

function activate(t: Tab) {
  active = t
  for (const x of tabs) x.view.hidden = x !== t
  renderTabs()
  requestAnimationFrame(() => {
    t.fit.fit()
    t.term.focus()
  })
}

function closeTab(t: Tab) {
  const i = tabs.indexOf(t)
  if (i < 0) return
  tabs.splice(i, 1)
  croo.termKill(t.id)
  t.term.dispose()
  t.view.remove()
  if (!tabs.length) return hide()
  if (active === t) activate(tabs[Math.min(i, tabs.length - 1)])
  else renderTabs()
}

export async function newTab(cwd = active?.cwd ?? getCwd() ?? '') {
  show()
  const term = new Terminal({
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    fontSize: 12.5,
    lineHeight: 1.25,
    cursorBlink: true,
    scrollback: 5000,
    macOptionIsMeta: true,
    theme: theme(),
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  const view = h('div', { class: 'term-view' })
  for (const x of tabs) x.view.hidden = true
  body.append(view)
  term.open(view)
  fit.fit()

  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown' || !e.metaKey) return true
    if (e.key === 'k') return term.clear(), false
    if (e.key === 'c' && term.hasSelection()) return void navigator.clipboard.writeText(term.getSelection()), false
    return true
  })

  const id = await croo.termCreate(cwd, term.cols, term.rows)
  const tab: Tab = { id, cwd, title: '', term, fit, view }
  term.onData((d) => croo.termWrite(id, d))
  term.onResize(({ cols, rows }) => croo.termResize(id, cols, rows))
  term.onTitleChange((t) => ((tab.title = t), renderTabs()))
  tabs.push(tab)
  for (const chunk of early.get(id) ?? []) term.write(chunk)
  early.delete(id)
  activate(tab)
}

function show() {
  panel.hidden = false
  document.getElementById('app')?.classList.add('term-open')
  active?.fit.fit()
  active?.term.focus()
}

export function closeTerminal() {
  hide()
}

function hide() {
  panel.hidden = true
  document.getElementById('app')?.classList.remove('term-open')
  document.getElementById('pane')?.querySelector<HTMLTextAreaElement>('.input-area')?.focus()
}

export function toggleTerminal() {
  if (isOpen()) return hide()
  if (tabs.length) show()
  else void newTab()
  if (active) show()
}

/** ⌘⇧[ and ⌘⇧] move between tabs. */
export function stepTab(delta: number) {
  if (tabs.length < 2 || !active) return
  activate(tabs[(tabs.indexOf(active) + delta + tabs.length) % tabs.length])
}

export function initTerminal(opts: { getCwd: () => string | undefined }) {
  getCwd = opts.getCwd
  panel = document.getElementById('term')!
  tabsEl = h('div', { class: 'term-tabs', role: 'tablist' })
  body = h('div', { class: 'term-body' })
  const grip = h('div', { class: 'term-resize' })
  panel.replaceChildren(
    grip,
    h(
      'div',
      { class: 'term-bar' },
      tabsEl,
      h('button', { class: 'icon-btn small', type: 'button', title: 'New terminal (⌘T)', onClick: () => void newTab() }, icon('plus', 15)),
      h('button', { class: 'icon-btn small', type: 'button', title: 'Hide terminal (⌘J)', onClick: hide }, icon('chevronDown', 15)),
    ),
    body,
  )

  const saved = Number(remember.get('termHeight'))
  if (saved >= 120) panel.style.setProperty('--term-h', `${saved}px`)
  grip.addEventListener('mousedown', (down) => {
    down.preventDefault()
    const startY = down.clientY
    const startH = panel.getBoundingClientRect().height
    const move = (e: MouseEvent) => {
      const height = Math.min(Math.max(startH + startY - e.clientY, 120), window.innerHeight * 0.75)
      panel.style.setProperty('--term-h', `${height}px`)
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      remember.set('termHeight', String(Math.round(panel.getBoundingClientRect().height)))
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  })

  new ResizeObserver(() => active && isOpen() && active.fit.fit()).observe(body)
  dark.addEventListener('change', () => {
    for (const t of tabs) t.term.options.theme = theme()
  })

  croo.onTermData((id, data) => {
    const t = tabs.find((x) => x.id === id)
    if (t) t.term.write(data)
    else early.set(id, [...(early.get(id) ?? []), data])
  })
  croo.onTermExit((id) => {
    const t = tabs.find((x) => x.id === id)
    if (t) closeTab(t)
  })
}
