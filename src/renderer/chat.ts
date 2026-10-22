import type { ChatEvent, Item, PreviewDto } from '../shared/ipc.js'
import { h, icon, tildify, type IconName } from './dom.js'
import { Frog, SAYINGS } from './frog.js'
import { renderMarkdown } from './markdown.js'
import { bus, croo, store, type ChatView } from './store.js'

const VERBS: Record<string, [string, string, IconName]> = {
  read_file: ['Reading', 'Read', 'file'],
  write_file: ['Writing', 'Wrote', 'pencil'],
  edit_file: ['Editing', 'Edited', 'pencil'],
  list_files: ['Listing', 'Listed', 'list'],
  grep: ['Searching', 'Searched', 'search'],
  bash: ['Running', 'Ran', 'terminal'],
}
const verb = (name: string, running: boolean): string => VERBS[name]?.[running ? 0 : 1] ?? name

interface Mounted {
  view: ChatView
  els: Map<Item, HTMLElement>
  thread: HTMLElement
  scroll: HTMLElement
  status: HTMLElement
  input: HTMLTextAreaElement
  send: HTMLButtonElement
  frog: Frog
  hero: HTMLElement | null
  stick: boolean
}

let m: Mounted | null = null
const open = new WeakSet<Item>()
const dirty = new Set<Item>()
let raf = 0

const running = (v: ChatView) => v.status !== 'idle'

// ---------- items ----------

function renderItem(item: Item): HTMLElement {
  switch (item.kind) {
    case 'user':
      return h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, item.text))
    case 'assistant':
      return h('div', { class: 'msg assistant md', html: renderMarkdown(item.text) })
    case 'error':
      return h('div', { class: 'msg error' }, item.text)
    case 'tool':
      return renderTool(item)
    case 'confirm':
      return renderConfirm(item)
  }
}

function renderTool(item: Extract<Item, { kind: 'tool' }>): HTMLElement {
  const [, , ic] = VERBS[item.name] ?? ['', '', 'file' as IconName]
  const state =
    item.status === 'running'
      ? h('span', { class: 'spinner' })
      : icon(item.status === 'ok' ? 'check' : item.status === 'denied' ? 'ban' : 'x', 13)
  const expandable = item.status !== 'running' && !!item.result?.trim()
  const row = h(
    'button',
    {
      class: 'tool-row',
      type: 'button',
      disabled: !expandable,
      onClick: () => {
        open.has(item) ? open.delete(item) : open.add(item)
        touch(item)
      },
    },
    icon(ic, 14),
    h('span', { class: 'tool-verb' }, verb(item.name, item.status === 'running')),
    h('span', { class: 'tool-summary' }, item.summary),
    h('span', { class: 'tool-state' }, state),
  )
  return h('div', { class: `tool ${item.status}` }, row, open.has(item) && expandable ? h('pre', { class: 'tool-out' }, item.result) : null)
}

function renderConfirm(item: Extract<Item, { kind: 'confirm' }>): HTMLElement {
  const answer = (a: 'y' | 'n' | 'a') => {
    if (!m) return
    const v = m.view
    void croo.answer(v.id, item.id, a)
    remove(item)
    if (a === 'n') setStatus(v, 'thinking')
    else setStatus(v, 'working', `${verb(item.name, true)} ${item.summary}`)
  }
  const title = item.name === 'bash' ? 'Run this command?' : item.name === 'write_file' ? 'Write this file?' : 'Make this edit?'
  const p = item.preview
  return h(
    'div',
    { class: 'confirm' },
    h(
      'div',
      { class: 'confirm-head' },
      h('span', { class: 'confirm-title' }, title),
      p.kind === 'diff' ? h('span', { class: 'confirm-sub' }, p.path) : null,
      p.kind === 'diff' ? h('span', { class: 'confirm-stat' }, h('b', { class: 'add' }, `+${p.added}`), ' ', h('b', { class: 'del' }, `−${p.removed}`)) : null,
    ),
    renderPreview(p),
    h(
      'div',
      { class: 'confirm-actions' },
      h('button', { class: 'btn primary', type: 'button', onClick: () => answer('y') }, 'Allow'),
      h('button', { class: 'btn', type: 'button', onClick: () => answer('a') }, `Always allow ${item.name === 'bash' ? 'commands' : 'edits'}`),
      h('button', { class: 'btn ghost', type: 'button', onClick: () => answer('n') }, 'Deny'),
      h('span', { class: 'confirm-keys' }, '⌘↵ allow · esc deny'),
    ),
  )
}

function renderPreview(p: PreviewDto): HTMLElement {
  if (p.kind === 'command') return h('pre', { class: 'cmd' }, h('span', { class: 'prompt' }, '$ '), p.command)
  const rows = p.lines.map((l) =>
    l === null
      ? h('div', { class: 'dl gap' }, '⋯')
      : h('div', { class: `dl ${l.type === '+' ? 'add' : l.type === '-' ? 'del' : ''}` }, h('span', { class: 'no' }, String(l.type === '+' ? l.newNo : (l.oldNo ?? ''))), h('span', { class: 'sign' }, l.type === ' ' ? '' : l.type === '+' ? '+' : '−'), h('span', { class: 'tx' }, l.text || ' ')),
  )
  if (p.more) rows.push(h('div', { class: 'dl gap' }, `… ${p.more} more lines`))
  return h('div', { class: 'diff' }, rows)
}

// ---------- live updates ----------

function push(v: ChatView, item: Item) {
  v.items.push(item)
  if (m?.view !== v) return
  m.hero?.remove()
  m.hero = null
  const el = renderItem(item)
  el.classList.add('enter')
  m.els.set(item, el)
  m.thread.insertBefore(el, m.status)
  follow()
}

function remove(item: Item) {
  if (!m) return
  const i = m.view.items.indexOf(item)
  if (i >= 0) m.view.items.splice(i, 1)
  m.els.get(item)?.remove()
  m.els.delete(item)
}

function touch(item: Item) {
  if (!m) return
  const old = m.els.get(item)
  if (!old) return
  const el = renderItem(item)
  old.replaceWith(el)
  m.els.set(item, el)
  follow()
}

function touchText(item: Item) {
  dirty.add(item)
  raf ||= requestAnimationFrame(() => {
    raf = 0
    for (const it of dirty) {
      const el = m?.els.get(it)
      if (el && it.kind === 'assistant') el.innerHTML = renderMarkdown(it.text)
    }
    dirty.clear()
    follow()
  })
}

function follow() {
  if (m?.stick) m.scroll.scrollTop = m.scroll.scrollHeight
}

function setStatus(v: ChatView, status: ChatView['status'], label = '', note?: string) {
  v.status = status
  v.label = label
  v.note = note
  if (m?.view === v) paintStatus()
  bus.sidebar()
}

function paintStatus() {
  if (!m) return
  const { view: v, status, frog } = m
  status.replaceChildren()
  if (v.status !== 'idle') {
    frog.set(v.status === 'working' ? 'working' : v.status === 'waiting' ? 'idle' : 'thinking')
    status.append(frog.el, h('span', { class: `status-label ${v.status === 'thinking' ? 'shimmer' : ''}` }, v.label || 'Thinking…'))
  } else if (v.note) {
    frog.set(v.note.startsWith('Stopped') ? 'idle' : 'happy')
    status.append(frog.el, h('span', { class: 'status-label' }, v.note))
  }
  m.send.replaceChildren(icon(running(v) ? 'stop' : 'arrowUp', running(v) ? 16 : 18))
  m.send.classList.toggle('stop', running(v))
  m.send.title = running(v) ? 'Stop' : 'Send'
  syncSend()
  follow()
}

function syncSend() {
  if (!m) return
  m.send.disabled = !running(m.view) && !m.input.value.trim()
}

export function handleEvent(ev: ChatEvent) {
  const v = store.views.get(ev.chatId)
  if (!v) return
  const last = v.items[v.items.length - 1]
  switch (ev.type) {
    case 'thinking':
      setStatus(v, 'thinking')
      break
    case 'text':
      if (last?.kind === 'assistant' && last.streaming) {
        last.text += ev.delta
        if (m?.view === v) touchText(last)
      } else push(v, { kind: 'assistant', text: ev.delta, streaming: true })
      break
    case 'textEnd':
      if (last?.kind === 'assistant' && last.streaming) {
        last.streaming = false
        if (!last.text.trim()) m?.view === v ? remove(last) : v.items.pop()
        else if (m?.view === v) touch(last)
      }
      break
    case 'toolRunning':
      push(v, { kind: 'tool', name: ev.name, summary: ev.summary, status: 'running' })
      setStatus(v, 'working', `${verb(ev.name, true)} ${ev.summary}`)
      break
    case 'toolDone': {
      const run = [...v.items].reverse().find((i) => i.kind === 'tool' && i.status === 'running' && i.name === ev.name && i.summary === ev.summary)
      const status = ev.ok ? 'ok' : ev.result === 'denied' ? 'denied' : 'error'
      if (run?.kind === 'tool') {
        run.status = status
        run.result = ev.result
        if (m?.view === v) touch(run)
      } else push(v, { kind: 'tool', name: ev.name, summary: ev.summary, status, result: ev.result })
      setStatus(v, 'thinking')
      break
    }
    case 'confirm':
      push(v, { kind: 'confirm', id: ev.id, name: ev.name, summary: ev.summary, preview: ev.preview })
      setStatus(v, 'waiting', 'Waiting for your OK')
      break
    case 'done':
      setStatus(v, 'idle', '', ev.seconds >= 1 ? `Done in ${ev.seconds.toFixed(1)}s` : 'Done')
      break
    case 'cancelled':
      closeOpenConfirms(v)
      setStatus(v, 'idle', '', 'Stopped')
      break
    case 'error':
      closeOpenConfirms(v)
      push(v, { kind: 'error', text: ev.message })
      setStatus(v, 'idle')
      break
  }
}

function closeOpenConfirms(v: ChatView) {
  for (const it of [...v.items]) if (it.kind === 'confirm') (m?.view === v ? remove(it) : v.items.splice(v.items.indexOf(it), 1))
  for (const it of v.items) if (it.kind === 'tool' && it.status === 'running') it.status = 'error'
  if (m?.view === v) for (const it of v.items) if (it.kind === 'tool') touch(it)
}

// ---------- the pane ----------

async function submit() {
  if (!m) return
  const { view: v, input } = m
  if (running(v)) return
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  v.draft = ''
  autosize()
  m.stick = true
  push(v, { kind: 'user', text })
  setStatus(v, 'thinking')
  const res = await croo.send(v.id, text)
  if (!res.ok) {
    push(v, { kind: 'error', text: res.error })
    setStatus(v, 'idle')
  }
}

function autosize() {
  if (!m) return
  const t = m.input
  t.style.height = 'auto'
  t.style.height = Math.min(t.scrollHeight, 220) + 'px'
}

export function focusComposer() {
  m?.input.focus()
}

/** The header title follows the chat's name as it changes (it is named after the first message). */
export function refreshHeader() {
  if (!m) return
  const title = store.state.workspaces.flatMap((w) => w.chats).find((c) => c.id === m!.view.id)?.title
  const el = document.querySelector('.chat-title')
  if (el && title) el.textContent = title
}

export function currentChat(): ChatView | null {
  return m?.view ?? null
}

export function showChat(view: ChatView, root: HTMLElement) {
  const state = store.state
  const folder = state.workspaces.find((w) => w.path === view.cwd)
  const profile = state.profiles.find((p) => p.active)
  const title = state.workspaces.flatMap((w) => w.chats).find((c) => c.id === view.id)?.title ?? 'New chat'

  const thread = h('div', { class: 'thread' })
  const scroll = h('div', { class: 'scroll' }, thread)
  const status = h('div', { class: 'status' })
  const input = h('textarea', { class: 'input-area', rows: 1, placeholder: `Ask Croo about ${folder?.name ?? 'this folder'}…`, spellcheck: 'true' })
  const send = h('button', { class: 'send', type: 'button', onClick: () => (running(view) ? void croo.stop(view.id) : void submit()) })
  const frog = new Frog(26)

  m = { view, els: new Map(), thread, scroll, status, input, send, frog, hero: null, stick: true }
  const mounted = m

  input.value = view.draft
  input.addEventListener('input', () => {
    view.draft = input.value
    autosize()
    syncSend()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      void submit()
    }
  })
  scroll.addEventListener('scroll', () => {
    mounted.stick = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80
  })
  thread.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.code-copy')
    if (!btn) return
    const text = btn.closest('.code')?.querySelector('code')?.textContent ?? ''
    void navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Copied'
      setTimeout(() => (btn.textContent = 'Copy'), 1200)
    })
  })

  if (!view.items.length) {
    mounted.hero = h(
      'div',
      { class: 'hero' },
      new Frog(104).el,
      h('p', { class: 'hero-say' }, `“${SAYINGS[Math.floor(Math.random() * SAYINGS.length)]}”`),
      h('h1', null, 'What should we work on?'),
      h('p', { class: 'hero-path' }, tildify(view.cwd, state.home)),
    )
    thread.append(mounted.hero)
  }
  for (const item of view.items) {
    const el = renderItem(item)
    mounted.els.set(item, el)
    thread.append(el)
  }
  thread.append(status)

  root.replaceChildren(
    h(
      'section',
      { class: 'chat' },
      h(
        'header',
        { class: 'chat-head drag' },
        h('button', { class: 'icon-btn no-drag show-when-hidden', type: 'button', title: 'Show sidebar (⌘B)', onClick: () => document.getElementById('app')?.classList.remove('sidebar-hidden') }, icon('sidebar', 17)),
        h('span', { class: 'chat-title' }, title),
        h('span', { class: 'chat-folder' }, folder?.name ?? ''),
      ),
      scroll,
      h(
        'div',
        { class: 'composer-wrap' },
        h('div', { class: 'composer' }, input, send),
        h(
          'div',
          { class: 'composer-hint' },
          h('span', null, tildify(view.cwd, state.home)),
          h('button', { class: 'chip no-drag', type: 'button', title: 'Provider settings', onClick: () => bus.settings() }, state.demo ? 'demo model' : (profile?.model ?? 'no model')),
        ),
      ),
    ),
  )
  paintStatus()
  autosize()
  requestAnimationFrame(() => {
    scroll.scrollTop = scroll.scrollHeight
    input.focus()
  })
}

/** ⌘↵ allows and Esc denies whatever the chat is waiting on. */
export function answerPending(a: 'y' | 'n'): boolean {
  const item = m?.view.items.find((i) => i.kind === 'confirm')
  if (!m || item?.kind !== 'confirm') return false
  void croo.answer(m.view.id, item.id, a)
  remove(item)
  setStatus(m.view, 'working', a === 'y' ? `${verb(item.name, true)} ${item.summary}` : '')
  return true
}
