import type { ChatEvent, Item, PreviewDto } from '../shared/ipc.js'
import { h, icon, tildify, type IconName } from './dom.js'
import { Frog, SAYINGS } from './frog.js'
import { renderMarkdown } from './markdown.js'
import { openModelMenu } from './models.js'
import { clampEffort, type Effort } from '../effort.js'
import { refreshFiles, refreshGit } from './side.js'
import { appendOutput, cleanShell, elapsed } from './run.js'
import type { Attachment, AttachmentView, RunKind } from '../shared/ipc.js'
import { attachmentsFromFiles, shrinkImage } from './attach.js'
import { costOf, formatCost } from '../cost.js'
import { bus, croo, store, type ChatView } from './store.js'
import type { PermissionMode, SlashCommand } from '../shared/ipc.js'
import { voiceControls } from './voice.js'
import { chatToMarkdown, exportName } from '../exportmd.js'

const VERBS: Record<string, [string, string, IconName]> = {
  read_file: ['Reading', 'Read', 'file'],
  write_file: ['Writing', 'Wrote', 'pencil'],
  edit_file: ['Editing', 'Edited', 'pencil'],
  list_files: ['Listing', 'Listed', 'list'],
  grep: ['Searching', 'Searched', 'search'],
  bash: ['Running', 'Ran', 'terminal'],
  multi_edit: ['Editing', 'Edited', 'pencil'],
  web_fetch: ['Fetching', 'Fetched', 'globe'],
  todo_write: ['Planning', 'Plan', 'check'],
  remember: ['Remembering', 'Remembered', 'sparkle'],
  bash_output: ['Reading output of', 'Read output of', 'terminal'],
  bash_kill: ['Stopping', 'Stopped', 'stop'],
  browser: ['Browsing', 'Browsed', 'globe'],
  task: ['Exploring', 'Explored', 'search'],
  skill: ['Loading skill', 'Loaded skill', 'sparkle'],
  propose_plan: ['Proposing plan', 'Proposed plan', 'map'],
  diagnostics: ['Checking', 'Checked', 'check'],
}
const TITLES: Record<string, string> = {
  bash: 'Run this command?',
  write_file: 'Write this file?',
  edit_file: 'Make this edit?',
  read_file: 'Read this file?',
  list_files: 'List these files?',
  grep: 'Search the project?',
  multi_edit: 'Make these edits?',
  web_fetch: 'Fetch this page?',
  browser: 'Open this page?',
  propose_plan: 'Approve this plan?',
  hooks: 'Run this folder’s hooks?',
  task: 'Start a research subagent?',
  skill: 'Load this skill?',
  bash_output: 'Read this command’s output?',
  bash_kill: 'Stop this command?',
}
/** MCP tools are named mcp__server__tool; show them as "Called github · create_issue". */
const mcpLabel = (name: string) => name.split('__').slice(1).join(' · ')
const verb = (name: string, running: boolean): string => VERBS[name]?.[running ? 0 : 1] ?? (name.startsWith('mcp__') ? `${running ? 'Calling' : 'Called'} ${mcpLabel(name)}` : name)

interface Mounted {
  view: ChatView
  els: Map<Item, HTMLElement>
  thread: HTMLElement
  scroll: HTMLElement
  status: HTMLElement
  input: HTMLTextAreaElement
  send: HTMLButtonElement
  frog: Frog
  mode: HTMLButtonElement
  chip: HTMLButtonElement
  effort: HTMLButtonElement
  tray: HTMLElement
  queue: HTMLElement
  tasks: HTMLElement
  hero: HTMLElement | null
  stick: boolean
}

let m: Mounted | null = null
const open = new WeakSet<Item>()
const dirty = new Set<Item>()
const started = new WeakMap<Item, number>()
let raf = 0

const running = (v: ChatView) => v.status !== 'idle'

const fmtTokens = (n: number) => (n < 1000 ? String(Math.round(n)) : n < 10000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`)

/** "12s · ~3.4k tokens": time so far and what the turn has used (estimated until the provider reports it). */
function metaText(v: ChatView): string {
  const live = running(v)
  const parts: string[] = []
  if (live && v.t0) parts.push(elapsed(performance.now() - v.t0))
  const out = (v.tokens?.output ?? 0) + (live ? (v.streamed ?? 0) / 4 : 0)
  const total = inputTokens(v) + out
  if (total >= 1) parts.push(`${live ? '~' : ''}${fmtTokens(total)} tokens`)
  const price = store.state.demo ? undefined : store.state.profiles.find((p) => p.active)?.price
  if (price && price.source !== 'local' && total >= 1) parts.push(`~${formatCost(costOf({ ...(v.tokens ?? { input: 0 }), output: out }, price))}`)
  return parts.join(' · ')
}

/** Every input token, whether the provider's cache served it or not. */
const inputTokens = (v: ChatView) => (v.tokens?.input ?? 0) + (v.tokens?.cacheRead ?? 0) + (v.tokens?.cacheWrite ?? 0)

const metaTip = (v: ChatView) =>
  `Input ${inputTokens(v).toLocaleString()}${v.tokens?.cacheRead ? ` (${v.tokens.cacheRead.toLocaleString()} from cache)` : ''} · Output ${Math.round((v.tokens?.output ?? 0) + (v.streamed ?? 0) / 4).toLocaleString()} tokens. Cost is an estimate from list prices.`

// Keep the clock moving while a turn runs, without redrawing the whole status row.
setInterval(() => {
  const el = document.querySelector<HTMLElement>('.status-meta')
  if (m && el && running(m.view)) (el.textContent = metaText(m.view), (el.dataset.tip = metaTip(m.view)))
}, 1000)

// ---------- items ----------

function renderItem(item: Item): HTMLElement {
  switch (item.kind) {
    case 'user':
      return renderUser(item)
    case 'assistant':
      return h(
        'div',
        { class: 'msg assistant' },
        h('div', { class: 'md', html: renderMarkdown(item.text) }),
        sourcesRow(item),
        h('div', { class: 'msg-foot' }, h('button', { class: 'icon-btn small copy-reply', type: 'button', title: 'Copy reply', onClick: (e: Event) => copyReply(e.currentTarget as HTMLElement, item.text) }, icon('copy', 13)), item.meta ? h('span', { class: 'msg-meta' }, item.meta) : null),
      )
    case 'thinking':
      return renderThinking(item)
    case 'error':
      return h('div', { class: 'msg error' }, item.text)
    case 'note':
      return item.detail ? renderNoteCard(item) : h('div', { class: 'msg note' }, item.text)
    case 'tool':
      return renderTool(item)
    case 'confirm':
      return renderConfirm(item)
  }
}

const fmtSize = (n?: number) => (n === undefined ? '' : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '')

/** A sent attachment: images as thumbnails you can open, files as small cards with their type and size. */
function attCard(a: AttachmentView): HTMLElement {
  if (a.kind === 'image' && a.dataUrl) {
    return h('button', { class: 'att-card image', type: 'button', title: a.name, onClick: () => openLightbox(a) }, h('img', { src: a.dataUrl, alt: a.name }), h('span', { class: 'att-cap' }, a.name))
  }
  const ext = extOf(a.name)
  let hue = 0
  for (const ch of ext) hue = (hue * 31 + ch.charCodeAt(0)) % 360
  return h(
    'div',
    { class: 'att-card file', title: a.name },
    h('span', { class: 'ext', style: `--hue:${hue}` }, (ext || 'file').slice(0, 4)),
    h('span', { class: 'att-meta' }, h('b', null, a.name), h('small', null, [extOf(a.name).toUpperCase() || 'File', fmtSize(a.size)].filter(Boolean).join(' · '))),
  )
}

function openLightbox(a: AttachmentView) {
  const close = () => (box.remove(), document.removeEventListener('keydown', onKey, true))
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), close())
  const box = h('div', { class: 'lightbox', onClick: close }, h('img', { src: a.dataUrl, alt: a.name }), h('span', null, `${a.name}${a.size ? ` · ${fmtSize(a.size)}` : ''}`))
  document.getElementById('modal-root')!.append(box)
  document.addEventListener('keydown', onKey, true)
}

/** The typed text, with @file mentions drawn as small file chips. */
function userText(text: string): (string | Node)[] {
  const out: (string | Node)[] = []
  let last = 0
  for (const mt of text.matchAll(/(^|\s)@([\w./-]*[./][\w./-]*)/g)) {
    const start = (mt.index ?? 0) + mt[1].length
    out.push(text.slice(last, start), h('span', { class: 'mention', title: mt[2] }, icon('file', 12), mt[2]))
    last = start + 1 + mt[2].length
  }
  out.push(text.slice(last))
  return out
}

function copyReply(btn: HTMLElement, text: string) {
  void navigator.clipboard.writeText(text).then(() => {
    btn.replaceChildren(icon('check', 13))
    setTimeout(() => btn.replaceChildren(icon('copy', 13)), 1200)
  })
}

/** Which typed message this is (0-based), the number its checkpoint is saved under. */
const ordinalOf = (v: ChatView, item: Item) => v.items.filter((i) => i.kind === 'user').indexOf(item as Extract<Item, { kind: 'user' }>)

/** Files Croo changed at or after this message can be put back. */
const restorable = (v: ChatView, ordinal: number) => ordinal >= 0 && (v.checkpoints ?? []).some((t) => t >= ordinal)

function renderUser(item: Extract<Item, { kind: 'user' }>): HTMLElement {
  const atts = item.attachments ?? []
  const v = m?.view
  const canRestore = !!v && restorable(v, ordinalOf(v, item))
  const long = item.text.length > 700 || item.text.split('\n').length > 12
  return h(
    'div',
    { class: 'msg user' },
    h(
      'div',
      { class: 'msg-actions' },
      canRestore ? h('button', { class: 'icon-btn small', type: 'button', title: 'Restore files to before this message', onClick: (e: Event) => void restoreFrom(item, e.currentTarget as HTMLElement) }, icon('undo', 13)) : null,
      h('button', { class: 'icon-btn small', type: 'button', title: 'Edit and resend', onClick: () => startEdit(item) }, icon('pencil', 13)),
    ),
    atts.length ? h('div', { class: 'att-cards' }, atts.map(attCard)) : null,
    item.text ? h('div', { class: `bubble ${long && !open.has(item) ? 'clamped' : ''}` }, ...userText(item.text)) : null,
    long ? h('button', { class: 'bubble-more', type: 'button', onClick: () => (open.has(item) ? open.delete(item) : open.add(item), touch(item)) }, open.has(item) ? 'Show less' : 'Show more') : null,
  )
}

/** Turn a sent message into a box you can edit; resending replaces everything after it. */
function startEdit(item: Extract<Item, { kind: 'user' }>) {
  if (!m || running(m.view)) return
  const el = m.els.get(item)
  if (!el) return
  const area = h('textarea', { class: 'edit-area', rows: 2, spellcheck: 'true' })
  area.value = item.text
  const ordinal = ordinalOf(m.view, item)
  const undo = h('input', { type: 'checkbox', class: 'edit-undo' }) as HTMLInputElement
  undo.checked = restorable(m.view, ordinal)
  const go = () => void rerun(item, area.value.trim(), undo.checked)
  const grow = () => ((area.style.height = 'auto'), (area.style.height = Math.min(area.scrollHeight, 260) + 'px'))
  area.addEventListener('input', grow)
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.preventDefault(), go())
    else if (e.key === 'Escape') (e.stopPropagation(), touch(item))
  })
  const form = h(
    'div',
    { class: 'msg user editing' },
    h(
      'div',
      { class: 'edit-box' },
      item.attachments?.length ? h('div', { class: 'att-cards' }, item.attachments.map(attCard)) : null,
      area,
      h(
        'div',
        { class: 'edit-foot' },
        restorable(m.view, ordinal)
          ? h('label', { class: 'edit-undo-row' }, undo, h('small', null, 'Replaces everything after this message, and undoes Croo’s file changes since'))
          : h('small', null, 'Replaces everything after this message.'),
        h('span', { class: 'push-right' }), h('button', { class: 'btn ghost small', type: 'button', onClick: () => touch(item) }, 'Cancel'), h('button', { class: 'btn primary small', type: 'button', onClick: go }, 'Resend')),
    ),
  )
  el.replaceWith(form)
  m.els.set(item, form)
  requestAnimationFrame(() => (grow(), area.focus()))
}

/** Cut the chat back to just before `item`, then send `text` (with the same attachments) as a fresh message. */
async function rerun(item: Extract<Item, { kind: 'user' }>, text: string, restoreFiles = false) {
  if (!m || !text) return
  const v = m.view
  const ordinal = ordinalOf(v, item)
  const res = await croo.rewind(v.id, ordinal, restoreFiles)
  if (!res.ok) return void push(v, { kind: 'error', text: res.error })
  for (const it of v.items.slice(v.items.indexOf(item))) remove(it)
  v.checkpoints = (v.checkpoints ?? []).filter((t) => t < ordinal)
  if (res.restored.length) {
    refreshFiles()
    void refreshGit()
  }
  await sendMessage(v, text, res.attachments)
}

const listFiles = (files: string[]) => (files.length > 3 ? `${files.slice(0, 3).join(', ')} and ${files.length - 3} more` : files.join(', '))

/** Put the files Croo changed at and after this message back, keeping the conversation. Asks first. */
async function restoreFrom(item: Item, anchor: HTMLElement) {
  if (!m || running(m.view)) return
  const v = m.view
  const ordinal = ordinalOf(v, item)
  const files = await croo.changedFiles(v.id, ordinal)
  if (!files.length) return
  document.querySelector('.restore-pop')?.remove()
  const close = () => (pop.remove(), document.removeEventListener('mousedown', outside, true))
  const outside = (e: MouseEvent) => !pop.contains(e.target as Node) && close()
  const go = async () => {
    close()
    const r = await croo.restore(v.id, ordinal)
    if (!r.ok) return void push(v, { kind: 'error', text: r.error })
    push(v, { kind: 'note', text: `Restored ${r.restored.length} file${r.restored.length === 1 ? '' : 's'} to before this message: ${listFiles(r.restored)}` })
    refreshFiles()
    void refreshGit()
  }
  const pop = h(
    'div',
    { class: 'restore-pop' },
    h('b', null, `Restore ${files.length} file${files.length === 1 ? '' : 's'}?`),
    h('small', null, 'Croo’s changes from this message on are undone. The conversation stays, and changes made by commands are not tracked.'),
    h('ul', null, files.slice(0, 8).map((f) => h('li', null, f)), files.length > 8 ? h('li', null, `… ${files.length - 8} more`) : null),
    h('div', { class: 'restore-actions' }, h('button', { class: 'btn ghost small', type: 'button', onClick: close }, 'Cancel'), h('button', { class: 'btn primary small', type: 'button', onClick: () => void go() }, 'Restore')),
  )
  anchor.closest('.msg')?.append(pop)
  document.addEventListener('mousedown', outside, true)
}

/** Undo the file changes of the last turn. */
async function undoLast(btn: HTMLElement) {
  if (!m) return
  const last = [...m.view.items].reverse().find((i) => i.kind === 'user')
  if (last) await restoreFrom(last, m.els.get(last) ?? btn)
}

/** Send the last message again, replacing the reply it got. */
async function retryLast() {
  if (!m || running(m.view)) return
  const last = [...m.view.items].reverse().find((i): i is Extract<Item, { kind: 'user' }> => i.kind === 'user')
  if (last) await rerun(last, last.text)
}

/** A note you can open: the line, with the text behind it (the summary that replaced earlier messages) below. */
function renderNoteCard(item: Extract<Item, { kind: 'note' }>): HTMLElement {
  const isOpen = open.has(item)
  return h(
    'div',
    { class: `msg note-card ${isOpen ? 'open' : ''}` },
    h('button', { class: 'note-bar', type: 'button', onClick: () => (open.has(item) ? open.delete(item) : open.add(item), touch(item)) }, icon('chevron', 12), h('span', null, item.text), h('small', null, isOpen ? 'Hide summary' : 'Show summary')),
    isOpen ? h('div', { class: 'note-body md', html: renderMarkdown(item.detail ?? '') }) : null,
  )
}

/** The last few lines of reasoning, shown as a fading trace while the model is still thinking. */
const traceOf = (text: string) => text.trim().split('\n').filter(Boolean).slice(-4).join('\n')

const duration = (s: number) => (s < 1 ? 'a moment' : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`)

/** Claude Code style: a quiet "Thought for 4s" row that opens to show the reasoning. */
function renderThinking(item: Extract<Item, { kind: 'thinking' }>): HTMLElement {
  const isOpen = open.has(item)
  const lastLine = traceOf(item.text)
  return h(
    'div',
    { class: `think ${item.done ? 'done' : 'live'} ${isOpen ? 'open' : ''}` },
    h(
      'button',
      { class: 'think-row', type: 'button', onClick: () => (open.has(item) ? open.delete(item) : open.add(item), touch(item)) },
      icon('chevron', 12),
      h('span', { class: `think-label ${item.done ? '' : 'shimmer'}` }, item.done ? (item.seconds ? `Thought for ${duration(item.seconds)}` : 'Thought') : 'Thinking…'),
      item.done ? null : h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      !item.done && !isOpen && lastLine ? h('span', { class: 'think-preview' }, lastLine) : null,
    ),
    isOpen ? h('div', { class: 'think-body md', html: renderMarkdown(item.text.trim()) }) : null,
  )
}

/** Close the reasoning block that was streaming, recording how long it took. */
function endThinking(v: ChatView) {
  for (const it of v.items) {
    if (it.kind !== 'thinking' || it.done) continue
    it.done = true
    it.seconds = (performance.now() - (started.get(it) ?? performance.now())) / 1000
    if (m?.view === v) touch(it)
  }
}

const icons = new Map<string, string | null>()

/** The mark at the start of a chip: the site's own icon once it arrives, a coloured initial until then (or when it has none). */
function siteMark(host: string): HTMLElement {
  let hue = 0
  for (const ch of host) hue = (hue * 31 + ch.charCodeAt(0)) % 360
  const mark = h('span', { class: 'src-mark', style: `--hue:${hue}` }, host.charAt(0).toUpperCase())
  const show = (src: string | null) => src && mark.replaceChildren(h('img', { src, alt: '', onError: () => mark.replaceChildren(host.charAt(0).toUpperCase()) }))
  if (icons.has(host)) show(icons.get(host)!)
  else void croo.favicon(host).then((src) => (icons.set(host, src), show(src)))
  return mark
}

function parseSource(url: string): { host: string; rest: string } {
  try {
    const u = new URL(url)
    return { host: u.hostname.replace(/^www\./, ''), rest: (u.pathname + u.search).replace(/^\/$/, '') }
  } catch {
    return { host: url, rest: '' }
  }
}

/** A fetched page as a small chip: the site's icon, its name, and the rest of the address dimmed. */
function sourceChip(url: string, link = false): HTMLElement {
  const { host, rest } = parseSource(url)
  const kids = [siteMark(host), h('b', null, host), rest ? h('small', null, rest) : null]
  return link ? h('a', { class: 'src-chip link', href: url, target: '_blank', rel: 'noreferrer', title: url }, ...kids) : h('span', { class: 'src-chip', title: url }, ...kids)
}

const SOURCES_SHOWN = 4

/** The pages a reply was written from, under it: a few chips, the rest behind "+N". */
function sourcesRow(item: Extract<Item, { kind: 'assistant' }>): HTMLElement | null {
  const urls = item.sources ?? []
  if (!urls.length) return null
  const all = open.has(item)
  const shown = all ? urls : urls.slice(0, SOURCES_SHOWN)
  return h(
    'div',
    { class: 'sources' },
    h('span', { class: 'sources-label' }, urls.length === 1 ? 'Source' : `${urls.length} sources`),
    ...shown.map((u) => sourceChip(u, true)),
    urls.length > SOURCES_SHOWN ? h('button', { class: 'src-more', type: 'button', onClick: () => (open.has(item) ? open.delete(item) : open.add(item), touch(item)) }, all ? 'Show less' : `+${urls.length - SOURCES_SHOWN}`) : null,
  )
}

/** Put the model, time and cost of the turn under its last reply. */
function stampReply(v: ChatView, seconds: number) {
  const lastUser = v.items.map((i) => i.kind).lastIndexOf('user')
  const reply = [...v.items].slice(lastUser + 1).reverse().find((i): i is Extract<Item, { kind: 'assistant' }> => i.kind === 'assistant')
  if (!reply) return
  const model = store.state.profiles.find((p) => p.active)?.model
  const urls = v.items.slice(lastUser + 1).flatMap((i) => (i.kind === 'tool' && i.name === 'web_fetch' && i.status === 'ok' ? [i.summary] : []))
  if (urls.length) reply.sources = [...new Set(urls)]
  reply.meta = [model, seconds >= 1 ? `${seconds.toFixed(1)}s` : '', metaText(v)].filter(Boolean).join(' · ')
  if (m?.view === v) touch(reply)
}

function renderTool(item: Extract<Item, { kind: 'tool' }>): HTMLElement {
  // The task list lives pinned above the message box, not in the thread.
  if (item.name === 'todo_write') return h('div', { class: 'tool-hidden', hidden: true })
  const [, , ic] = VERBS[item.name] ?? ['', '', (item.name.startsWith('mcp__') ? 'plug' : 'file') as IconName]
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
    item.name === 'web_fetch' ? sourceChip(item.summary) : h('span', { class: 'tool-summary' }, item.summary),
    h('span', { class: 'tool-state' }, state),
  )
  const shot = item.image ? h('button', { class: 'tool-shot', type: 'button', title: 'Open screenshot', onClick: () => openLightbox({ name: 'Screenshot', kind: 'image', dataUrl: item.image }) }, h('img', { src: item.image, alt: 'Screenshot' })) : null
  return h('div', { class: `tool ${item.status}` }, row, shot, open.has(item) && expandable ? h('pre', { class: 'tool-out' }, item.result) : null)
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
  const title = TITLES[item.name] ?? (item.name.startsWith('mcp__') ? `Use ${mcpLabel(item.name)}?` : 'Allow this?')
  // The plan and a folder's hooks are a yes or no for now, never "always".
  const once = item.name === 'propose_plan' || item.name === 'hooks'
  const manual = store.state.permissionMode === 'manual' || once
  const [yes, no] = item.name === 'propose_plan' ? ['Approve and start', 'Keep planning'] : item.name === 'hooks' ? ['Trust and run', 'Skip hooks'] : ['Allow', 'Deny']
  const p = item.preview
  return h(
    'div',
    { class: `confirm ${p.kind === 'plan' ? 'plan' : ''}` },
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
      h('button', { class: 'btn primary', type: 'button', onClick: () => answer('y') }, yes),
      manual ? null : h('button', { class: 'btn', type: 'button', onClick: () => answer('a') }, `Always allow ${item.name === 'bash' ? 'commands' : item.name === 'edit_file' || item.name === 'write_file' || item.name === 'multi_edit' ? 'edits' : item.name === 'web_fetch' ? 'fetches' : 'this'}`),
      h('button', { class: 'btn ghost', type: 'button', onClick: () => answer('n') }, no),
      h('span', { class: 'confirm-keys' }, once ? `⌘↵ ${yes.toLowerCase()} · esc ${no.toLowerCase()}` : '⌘↵ allow · esc deny'),
    ),
  )
}

function renderPreview(p: PreviewDto): HTMLElement {
  if (p.kind === 'command') return h('pre', { class: 'cmd' }, h('span', { class: 'prompt' }, '$ '), p.command)
  if (p.kind === 'read') return h('pre', { class: 'cmd' }, p.summary)
  if (p.kind === 'plan') return h('div', { class: 'plan-body md', html: renderMarkdown(p.plan) })
  const rows = p.lines.map((l) =>
    l === null
      ? h('div', { class: 'dl gap' }, '⋯')
      : h('div', { class: `dl ${l.type === '+' ? 'add' : l.type === '-' ? 'del' : ''}` }, h('span', { class: 'no' }, String(l.type === '+' ? l.newNo : (l.oldNo ?? ''))), h('span', { class: 'sign' }, l.type === ' ' ? '' : l.type === '+' ? '+' : '−'), h('span', { class: 'tx' }, l.text || ' ')),
  )
  if (p.more) rows.push(h('div', { class: 'dl gap' }, `… ${p.more} more lines`))
  return h('div', { class: 'diff' }, rows)
}

// ---------- running code from the chat ----------

interface Run {
  key: string
  id?: string
  kind: RunKind
  out: string
  status: 'running' | 'ok' | 'failed' | 'stopped'
  exit?: number | null
  t0: number
  ms?: number
  stopping?: boolean
  el?: HTMLElement
}
const runs = new Map<string, Run>()
const runById = new Map<string, Run>()
const runDirty = new Set<Run>()
let runRaf = 0

const blockCode = (block: Element) => block.querySelector('code')?.textContent ?? ''
const runKey = (viewId: string, kind: string, code: string) => `${viewId}|${kind}|${code}`

function schedulePaint(r: Run) {
  runDirty.add(r)
  runRaf ||= requestAnimationFrame(() => {
    runRaf = 0
    for (const x of runDirty) paintRun(x)
    runDirty.clear()
  })
}

function paintRun(r: Run) {
  const el = r.el
  if (!el?.isConnected) return
  const pre = el.querySelector<HTMLElement>('.run-text')!
  const near = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40
  pre.textContent = r.out || (r.status === 'running' ? '' : '(no output)')
  if (near) pre.scrollTop = pre.scrollHeight
  el.className = `run-out ${r.status}`
  const status = el.querySelector<HTMLElement>('.run-status')!
  const took = r.ms !== undefined ? ` · ${elapsed(r.ms)}` : ''
  status.replaceChildren(
    r.status === 'running' ? h('span', { class: 'spinner' }) : icon(r.status === 'ok' ? 'check' : r.status === 'stopped' ? 'stop' : 'x', 13),
    h('span', null, r.status === 'running' ? 'Running…' : r.status === 'ok' ? `Finished${took}` : r.status === 'stopped' ? `Stopped${took}` : `Failed, exit ${r.exit ?? '?'}${took}`),
  )
  const btn = el.previousElementSibling?.querySelector<HTMLElement>('.code-run')
  if (btn) {
    const running = r.status === 'running'
    btn.classList.toggle('stop', running)
    btn.replaceChildren(running ? icon('stop', 11) : icon('play', 11), h('span', null, running ? 'Stop' : 'Run'))
  }
}

function mountRun(block: Element, r: Run) {
  let el = block.nextElementSibling as HTMLElement | null
  if (!el?.classList.contains('run-out')) {
    el = h(
      'div',
      { class: 'run-out' },
      h(
        'div',
        { class: 'run-head' },
        h('span', { class: 'run-status' }),
        h('span', { class: 'push-right' }),
        h('button', { class: 'icon-btn small', type: 'button', title: 'Copy output', onClick: () => void navigator.clipboard.writeText(r.out) }, icon('copy', 14)),
        h('button', { class: 'icon-btn small', type: 'button', title: 'Hide output', onClick: () => (runs.delete(r.key), r.id && runById.delete(r.id), r.el?.remove()) }, icon('x', 14)),
      ),
      h('pre', { class: 'run-text', tabindex: 0 }),
    )
    block.after(el)
  }
  r.el = el
  paintRun(r)
}

/** Put back the output panels under code blocks after a message was re-rendered. */
function restoreRuns(root: ParentNode, viewId: string) {
  for (const block of root.querySelectorAll('.code')) {
    const btn = block.querySelector<HTMLElement>('.code-run')
    if (!btn) continue
    const r = runs.get(runKey(viewId, btn.dataset.kind ?? '', blockCode(block)))
    if (r) mountRun(block, r)
  }
}

async function runBlock(block: Element, btn: HTMLElement) {
  if (!m || m.view.kind !== 'code') return
  const view = m.view
  const kind = btn.dataset.kind as RunKind
  const code = blockCode(block)
  const key = runKey(view.id, kind, code)
  const prev = runs.get(key)
  if (prev?.status === 'running') {
    prev.stopping = true
    if (prev.id) croo.runStop(prev.id)
    return
  }
  if (prev?.id) runById.delete(prev.id)
  const r: Run = { key, kind, out: '', status: 'running', t0: performance.now() }
  runs.set(key, r)
  mountRun(block, r)
  try {
    r.id = await croo.runCode(view.cwd, kind, kind === 'shell' ? cleanShell(code) : code)
    runById.set(r.id, r)
  } catch (e: any) {
    r.status = 'failed'
    r.out = String(e?.message ?? e)
    schedulePaint(r)
  }
}

export function initRuns() {
  // Files dropped on the message box or the thread become attachments.
  croo.onAttach((list, skipped) => void addAttachments(list, [...skipped]))
  const over = (on: boolean) => document.querySelector('.composer')?.classList.toggle('dragging', on)
  window.addEventListener('dragover', (e) => over(!!(e.target as HTMLElement).closest?.('.composer-wrap, .thread, .scroll') && !!m))
  window.addEventListener('dragleave', (e) => !e.relatedTarget && over(false))
  window.addEventListener('drop', () => over(false))
  croo.onRunData((id, data) => {
    const r = runById.get(id)
    if (!r) return
    r.out = appendOutput(r.out, data)
    schedulePaint(r)
  })
  croo.onRunExit((e) => {
    const r = runById.get(e.id)
    if (!r) return
    r.exit = e.code
    r.ms = performance.now() - r.t0
    r.status = r.stopping ? 'stopped' : e.code === 0 ? 'ok' : 'failed'
    schedulePaint(r)
    // A command may have changed files or the repository.
    refreshFiles()
    void refreshGit()
  })
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
  restoreRuns(el, m.view.id)
  follow()
}

function touchText(item: Item) {
  dirty.add(item)
  raf ||= requestAnimationFrame(() => {
    raf = 0
    for (const it of dirty) {
      const el = m?.els.get(it)
      if (el && it.kind === 'assistant') {
        const md = el.querySelector('.md')
        if (md) (md.innerHTML = renderMarkdown(it.text), m && restoreRuns(md, m.view.id))
      }
      else if (el && it.kind === 'thinking') {
        // Update in place: rebuilding the row on every frame makes it impossible to hover or click.
        const preview = el.querySelector('.think-preview')
        const body = el.querySelector('.think-body')
        const lastLine = traceOf(it.text)
        if (body) {
          const stick = body.scrollHeight - body.scrollTop - body.clientHeight < 40
          body.innerHTML = renderMarkdown(it.text.trim())
          if (stick) body.scrollTop = body.scrollHeight
        }
        if (preview) preview.textContent = lastLine
        else if (!body && lastLine) touch(it)
      }
    }
    dirty.clear()
    follow()
  })
}

function follow() {
  if (m?.stick) m.scroll.scrollTop = m.scroll.scrollHeight
  paintJump()
}

/** The round "jump to latest" button shows once you have scrolled well away from the bottom. */
function paintJump() {
  if (!m) return
  const away = m.scroll.scrollHeight - m.scroll.scrollTop - m.scroll.clientHeight > 240
  m.scroll.parentElement?.querySelector('.jump')?.classList.toggle('show', away)
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
    frog.set(v.status === 'thinking' ? 'thinking' : v.status)
    status.append(frog.el, h('span', { class: `status-label ${v.status === 'thinking' ? 'shimmer' : ''}` }, v.label || 'Thinking…'), h('span', { class: 'status-meta', 'data-tip': metaTip(v) }, metaText(v)))
  } else if (v.note) {
    frog.set(v.note.startsWith('Stopped') ? 'idle' : v.note.startsWith('Something') ? 'oops' : 'happy')
    const lastTurn = v.items.filter((i) => i.kind === 'user').length - 1
    const undo = v.kind === 'code' && (v.checkpoints ?? []).includes(lastTurn) ? h('button', { class: 'status-btn', type: 'button', title: 'Undo the file changes from this turn', onClick: (e: Event) => void undoLast(e.currentTarget as HTMLElement) }, icon('undo', 12), 'Undo changes') : null
    status.append(frog.el, h('span', { class: 'status-label' }, v.note), h('span', { class: 'status-meta', 'data-tip': metaTip(v) }, metaText(v)), h('button', { class: 'status-btn', type: 'button', title: 'Retry', onClick: () => void retryLast() }, icon('refresh', 12), 'Retry'), ...(undo ? [undo] : []))
  }
  syncSend()
  follow()
}

function syncSend() {
  if (!m) return
  const busy = running(m.view)
  const typed = !!m.input.value.trim() || !!m.view.attachments?.length
  // While the agent works, typing turns Stop into "queue this message".
  const stop = busy && !typed
  m.send.replaceChildren(icon(stop ? 'stop' : 'arrowUp', stop ? 16 : 18))
  m.send.classList.toggle('stop', stop)
  m.input.closest('.composer')?.classList.toggle('busy', busy)
  m.send.title = stop ? 'Stop' : busy ? 'Queue (↵ or ⌘↵)' : 'Send'
  m.send.disabled = !busy && !typed
  m.input.placeholder = busy ? 'Queue a message, it sends when this finishes…' : (m.input.dataset.ph ?? m.input.placeholder)
}

// ---------- task list ----------

interface Task {
  text: string
  state: 'done' | 'now' | 'todo'
}

const MARKS: Record<string, Task['state']> = { x: 'done', '~': 'now', ' ': 'todo' }

/** The latest todo_write list in the chat, read back from its result ("[x] step" lines). */
function latestTasks(v: ChatView): { tasks: Task[]; key: string; thisTurn: boolean } | null {
  let lastUser = -1
  let found = -1
  v.items.forEach((it, i) => {
    if (it.kind === 'user') lastUser = i
    if (it.kind === 'tool' && it.name === 'todo_write' && it.status === 'ok' && it.result) found = i
  })
  if (found < 0) return null
  const result = (v.items[found] as Extract<Item, { kind: 'tool' }>).result!
  const tasks = result
    .split('\n')
    .map((l) => /^\[(x|~| )\] (.*)$/.exec(l))
    .filter((x): x is RegExpExecArray => !!x)
    .map((x) => ({ state: MARKS[x[1]], text: x[2] }))
  return tasks.length ? { tasks, key: result, thisTurn: found > lastUser } : null
}

function paintTasks() {
  if (!m) return
  const v = m.view
  const list = latestTasks(v)
  const done = list?.tasks.filter((t) => t.state === 'done').length ?? 0
  const finished = !!list && done === list.tasks.length
  // A finished list from an earlier turn, or one you closed, stays out of the way.
  const show = !!list && v.tasksDismissed !== list.key && (!finished || list.thisTurn)
  m.tasks.hidden = !show
  if (!show || !list) return m.tasks.replaceChildren()
  const open = v.tasksOpen ?? !finished
  const now = list.tasks.find((t) => t.state === 'now')
  m.tasks.className = `tasks ${open ? 'open' : ''} ${finished ? 'finished' : ''}`
  m.tasks.replaceChildren(
    h(
      'div',
      { class: 'tasks-head' },
      h(
        'button',
        { class: 'tasks-toggle', type: 'button', 'aria-expanded': String(open), onClick: () => ((v.tasksOpen = !open), paintTasks()) },
        finished ? h('span', { class: 'task-mark done' }, icon('check', 11)) : h('span', { class: 'tasks-ring', style: `--p:${list.tasks.length ? done / list.tasks.length : 0}` }),
        h('span', { class: 'tasks-title' }, finished ? 'All tasks done' : (now?.text ?? 'Tasks')),
        h('span', { class: 'tasks-count' }, `${done}/${list.tasks.length}`),
        icon('chevronDown', 12),
      ),
      finished ? h('button', { class: 'tasks-x', type: 'button', title: 'Hide', onClick: () => ((v.tasksDismissed = list.key), paintTasks()) }, icon('x', 11)) : null,
    ),
    ...(open ? [h('ol', { class: 'tasks-list' }, list.tasks.map((t) => h('li', { class: `task ${t.state}` }, h('span', { class: 'task-mark' }, t.state === 'done' ? icon('check', 11) : null), h('span', { class: 'task-text' }, t.text))))] : []),
  )
}

function paintQueue() {
  if (!m) return
  const v = m.view
  const q = v.queue ?? []
  m.queue.hidden = !q.length
  m.queue.replaceChildren(
    ...q.map((item, i) =>
      h(
        'div',
        { class: 'queued', title: item.text },
        icon('arrowUp', 12),
        h('span', { class: 'queued-text' }, item.text),
        h('button', { class: 'queued-x', type: 'button', title: 'Remove from queue', onClick: () => (q.splice(i, 1), paintQueue()) }, icon('x', 11)),
      ),
    ),
  )
}

/** The agent finished: send the next queued message, if any. */
function flushQueue(v: ChatView) {
  const next = v.queue?.shift()
  if (m?.view === v) paintQueue()
  if (next) setTimeout(() => void sendMessage(v, next.text, next.atts), 0)
}

export function handleEvent(ev: ChatEvent) {
  const v = store.views.get(ev.chatId)
  if (!v) return
  const last = v.items[v.items.length - 1]
  switch (ev.type) {
    case 'thinking':
      endThinking(v)
      setStatus(v, 'thinking')
      break
    case 'usage':
      v.tokens = {
        input: (v.tokens?.input ?? 0) + ev.input,
        output: (v.tokens?.output ?? 0) + ev.output,
        cacheRead: (v.tokens?.cacheRead ?? 0) + (ev.cacheRead ?? 0),
        cacheWrite: (v.tokens?.cacheWrite ?? 0) + (ev.cacheWrite ?? 0),
      }
      v.streamed = 0
      break
    case 'reasoning':
      v.streamed = (v.streamed ?? 0) + ev.delta.length
      if (last?.kind === 'thinking' && !last.done) {
        last.text += ev.delta
        if (m?.view === v) touchText(last)
      } else {
        const item: Item = { kind: 'thinking', text: ev.delta, done: false }
        started.set(item, performance.now())
        push(v, item)
      }
      break
    case 'text':
      v.streamed = (v.streamed ?? 0) + ev.delta.length
      endThinking(v)
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
      endThinking(v)
      push(v, { kind: 'tool', name: ev.name, summary: ev.summary, status: 'running' })
      setStatus(v, 'working', `${verb(ev.name, true)} ${ev.summary}`)
      break
    case 'toolDone': {
      const run = [...v.items].reverse().find((i) => i.kind === 'tool' && i.status === 'running' && i.name === ev.name && i.summary === ev.summary)
      const status = ev.ok ? 'ok' : ev.result === 'denied' ? 'denied' : 'error'
      if (run?.kind === 'tool') {
        run.status = status
        run.result = ev.result
        run.image = ev.image
        if (m?.view === v) touch(run)
      } else push(v, { kind: 'tool', name: ev.name, summary: ev.summary, status, result: ev.result, image: ev.image })
      if (ev.name === 'todo_write') {
        v.tasksOpen = undefined
        if (m?.view === v) paintTasks()
      }
      setStatus(v, 'thinking')
      break
    }
    case 'note':
      push(v, { kind: 'note', text: ev.text })
      break
    case 'checkpoints':
      v.checkpoints = ev.turns
      if (m?.view === v) {
        for (const it of v.items) if (it.kind === 'user') touch(it)
        paintStatus()
      }
      break
    case 'planApproved':
      push(v, { kind: 'note', text: 'Plan approved. Plan mode is off and Croo is working in Auto mode.' })
      break
    case 'compacted':
      push(v, { kind: 'note', text: 'Earlier messages were summarized to free up context', detail: ev.summary })
      break
    case 'context':
      v.context = { used: ev.used, window: ev.window }
      if (m?.view === v) paintRing(v)
      break
    case 'confirm':
      endThinking(v)
      push(v, { kind: 'confirm', id: ev.id, name: ev.name, summary: ev.summary, preview: ev.preview })
      setStatus(v, 'waiting', 'Waiting for your OK')
      break
    case 'done':
      refreshFiles()
      void refreshGit()
      endThinking(v)
      stampReply(v, ev.seconds)
      setStatus(v, 'idle', '', ev.seconds >= 1 ? `Done in ${ev.seconds.toFixed(1)}s` : 'Done')
      flushQueue(v)
      break
    case 'cancelled':
      v.queue = []
      if (m?.view === v) paintQueue()
      endThinking(v)
      closeOpenConfirms(v)
      setStatus(v, 'idle', '', 'Stopped')
      break
    case 'error':
      v.queue = []
      if (m?.view === v) paintQueue()
      endThinking(v)
      closeOpenConfirms(v)
      push(v, { kind: 'error', text: ev.message })
      setStatus(v, 'idle', '', 'Something went wrong')
      break
  }
}

function closeOpenConfirms(v: ChatView) {
  for (const it of [...v.items]) if (it.kind === 'confirm') (m?.view === v ? remove(it) : v.items.splice(v.items.indexOf(it), 1))
  for (const it of v.items) if (it.kind === 'tool' && it.status === 'running') it.status = 'error'
  if (m?.view === v) for (const it of v.items) if (it.kind === 'tool') touch(it)
}

// ---------- the pane ----------

const toView = (a: Attachment): AttachmentView => ({ name: a.name, kind: a.kind, dataUrl: a.kind === 'image' ? a.dataUrl : undefined, size: a.kind === 'image' ? Math.round(((a.dataUrl?.length ?? 0) * 3) / 4) : new Blob([a.text ?? '']).size })

async function sendMessage(v: ChatView, text: string, atts: Attachment[]) {
  if (m) m.stick = true
  v.t0 = performance.now()
  v.tokens = { input: 0, output: 0 }
  v.streamed = 0
  push(v, { kind: 'user', text, attachments: atts.length ? atts.map(toView) : undefined })
  if (m?.view === v) paintTasks()
  setStatus(v, 'thinking')
  const res = await croo.send(v.id, text, atts)
  if (!res.ok) {
    push(v, { kind: 'error', text: res.error })
    setStatus(v, 'idle')
  }
}

async function submit() {
  if (!m) return
  const { view: v, input } = m
  const atts = v.attachments ?? []
  const text = input.value.trim() || (atts.length ? 'See what I attached.' : '')
  if (!text) return
  input.value = ''
  v.draft = ''
  v.attachments = []
  closeMention()
  paintTray()
  autosize()
  if (running(v)) {
    // Busy: line it up behind the current turn.
    ;(v.queue ??= []).push({ text, atts })
    paintQueue()
    syncSend()
    return
  }
  await sendMessage(v, text, atts)
}

// ---------- attachments ----------

const MAX_ATTACHMENTS = 8
let trayNote: string | null = null

function paintTray() {
  if (!m) return
  const atts = m.view.attachments ?? []
  m.tray.hidden = !atts.length && !trayNote
  m.tray.replaceChildren(
    ...atts.map((a, i) =>
      h(
        'div',
        { class: 'att', title: a.name },
        a.kind === 'image' && a.dataUrl ? h('img', { src: a.dataUrl, alt: '' }) : icon('file', 14),
        h('span', null, a.name),
        h('button', { class: 'att-x', type: 'button', title: 'Remove', onClick: () => (atts.splice(i, 1), paintTray(), syncSend()) }, icon('x', 11)),
      ),
    ),
    ...(trayNote ? [h('span', { class: 'att-note' }, trayNote)] : []),
  )
}

async function addAttachments(list: Attachment[], skipped: string[]) {
  if (!m) return
  const v = m.view
  const have = v.attachments ?? (v.attachments = [])
  for (const a of list) {
    if (have.length >= MAX_ATTACHMENTS) {
      skipped.push(a.name)
      continue
    }
    try {
      have.push(a.kind === 'image' ? await shrinkImage(a) : a)
    } catch {
      skipped.push(a.name)
    }
  }
  trayNote = skipped.length ? `Couldn’t attach ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''} (too big, or not text or an image)` : null
  if (trayNote) setTimeout(() => ((trayNote = null), paintTray()), 5000)
  paintTray()
  syncSend()
}

// ---------- @file mentions ----------

let mention: { start: number; items: string[]; index: number } | null = null
let mentionTimer = 0

function closeMention() {
  mention = null
  clearTimeout(mentionTimer)
  document.querySelector('.mention-menu')?.remove()
}

function paintMention() {
  if (!m || !mention) return
  const wrap = m.input.closest('.composer-wrap')
  document.querySelector('.mention-menu')?.remove()
  const mn = mention
  wrap?.append(
    h(
      'div',
      { class: 'mention-menu', role: 'listbox' },
      mn.items.map((rel, i) => {
        const slash = rel.lastIndexOf('/')
        return h('button', { class: `mention-row ${i === mn.index ? 'on' : ''}`, type: 'button', role: 'option', onMousedown: (e: Event) => e.preventDefault(), onClick: () => insertMention(i) }, icon('file', 14), h('span', { class: 'mention-name' }, rel.slice(slash + 1)), slash >= 0 ? h('small', null, rel.slice(0, slash)) : null)
      }),
    ),
  )
  document.querySelector('.mention-row.on')?.scrollIntoView({ block: 'nearest' })
}

function insertMention(i: number) {
  if (!m || !mention) return
  const t = m.input
  const rel = mention.items[i]
  const at = t.selectionStart
  t.value = `${t.value.slice(0, mention.start)}@${rel} ${t.value.slice(at)}`
  const caret = mention.start + rel.length + 2
  t.setSelectionRange(caret, caret)
  closeMention()
  t.dispatchEvent(new Event('input'))
  t.focus()
}

function updateMention() {
  if (!m || m.view.kind !== 'code') return closeMention()
  const t = m.input
  const before = t.value.slice(0, t.selectionStart)
  const hit = before.match(/(^|\s)@([\w./-]*)$/)
  if (!hit) return closeMention()
  const start = before.length - hit[2].length - 1
  clearTimeout(mentionTimer)
  mentionTimer = window.setTimeout(async () => {
    if (!m) return
    const items = await croo.searchFiles(m.view.cwd, hit[2])
    if (!m || !items.length) return closeMention()
    mention = { start, items, index: 0 }
    paintMention()
  }, 80)
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

const allChats = () => [...store.state.workspaces.flatMap((w) => w.chats), ...store.state.chats]

/** The header title follows the chat's name as it changes (it is named after the first message). */
let voiceRefresh: (() => void) | null = null
export const refreshVoice = () => voiceRefresh?.()

/** Save this chat as a markdown file. */
async function exportCurrent() {
  if (!m) return
  const v = m.view
  const title = document.querySelector('.chat-title')?.textContent || 'Chat'
  const folder = store.state.workspaces.find((w) => w.path === v.cwd)
  const model = store.state.profiles.find((p) => p.active)?.model
  const saved = await croo.exportChat(exportName(title), chatToMarkdown(v.items, { title, folder: v.kind === 'code' ? folder?.name : undefined, model }))
  if (saved) setStatus(v, 'idle', '', 'Chat exported')
}

export function refreshHeader() {
  if (!m) return
  const title = allChats().find((c) => c.id === m!.view.id)?.title
  const el = document.querySelector('.chat-title')
  if (el && title) el.textContent = title
}

const RING_R = 7
const RING_C = 2 * Math.PI * RING_R
/** Croo summarizes older messages at this share of the window (COMPACT_AT in compact.ts). */
const COMPACT_SHARE = 0.8

/** A small ring in the header that fills as the conversation uses up the model's context window. */
function contextRing(v: ChatView): HTMLElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 18 18')
  svg.setAttribute('width', '18')
  svg.setAttribute('height', '18')
  svg.innerHTML = `<circle class="ring-track" cx="9" cy="9" r="${RING_R}"/><circle class="ring-fill" cx="9" cy="9" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}" transform="rotate(-90 9 9)"/>`
  const el = h('span', { class: 'context-ring no-drag', role: 'img' }, svg)
  queueMicrotask(() => paintRing(v))
  return el
}

function paintRing(v: ChatView) {
  const el = document.querySelector<HTMLElement>('.chat-head .context-ring')
  if (!el) return
  const c = v.context
  el.hidden = !c?.window || !c.used
  if (!c?.window || !c.used) return
  const share = Math.min(c.used / c.window, 1)
  el.querySelector('.ring-fill')?.setAttribute('stroke-dashoffset', String(RING_C * (1 - share)))
  el.classList.toggle('warn', share >= COMPACT_SHARE - 0.15 && share < COMPACT_SHARE)
  el.classList.toggle('full', share >= COMPACT_SHARE)
  const pct = Math.round(share * 100)
  el.title = `Context: ${fmtTokens(c.used)} of ${fmtTokens(c.window)} tokens (${pct}%). Older messages are summarized automatically at ${COMPACT_SHARE * 100}%.`
  el.setAttribute('aria-label', `Context ${pct}% full`)
}

export function currentChat(): ChatView | null {
  return m?.view ?? null
}

export function showChat(view: ChatView, root: HTMLElement) {
  const state = store.state
  const folder = state.workspaces.find((w) => w.path === view.cwd)
  const profile = state.profiles.find((p) => p.active)
  const title = allChats().find((c) => c.id === view.id)?.title ?? 'New chat'
  const plain = view.kind === 'chat'
  if (!plain) loadSlashCommands(view.cwd)

  const thread = h('div', { class: 'thread' })
  const scroll = h('div', { class: 'scroll' }, thread)
  const jump = h('button', { class: 'jump', type: 'button', title: 'Scroll to latest', 'aria-label': 'Scroll to latest', onClick: () => scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' }) }, icon('chevron', 15))
  const status = h('div', { class: 'status' })
  const input = h('textarea', { class: 'input-area', rows: 1, placeholder: plain ? 'Message Croo…' : `Ask Croo about ${folder?.name ?? 'this folder'}…`, spellcheck: 'true' })
  input.dataset.ph = input.placeholder
  const voice = voiceControls(input, (t) => setStatus(view, 'idle', '', t))
  voiceRefresh = voice.refresh
  const send = h('button', { class: 'send', type: 'button', onClick: () => (running(view) && !input.value.trim() && !view.attachments?.length ? void croo.stop(view.id) : void submit()) })
  const frog = new Frog(42)

  const mode = h('button', { class: 'mode no-drag', type: 'button', onClick: () => toggleModeMenu() })
  const chip = h('button', { class: 'chip no-drag', type: 'button', onClick: () => openModelMenu(chip, composerWrap) })
  const effort = h('button', { class: 'effort no-drag', type: 'button', onClick: () => toggleEffortMenu() })
  const composerWrap = h('div', { class: 'composer-wrap' })
  const tray = h('div', { class: 'attach-tray', hidden: true })
  const queue = h('div', { class: 'queue', hidden: true })
  const tasks = h('div', { class: 'tasks', hidden: true })
  m = { view, els: new Map(), thread, scroll, status, input, send, frog, mode, chip, effort, tray, queue, tasks, hero: null, stick: true }
  const mounted = m

  input.value = view.draft
  input.addEventListener('input', () => {
    view.draft = input.value
    autosize()
    syncSend()
    updateSlash()
    updateMention()
  })
  input.addEventListener('click', updateMention)
  input.addEventListener('paste', async (e) => {
    const files = [...(e.clipboardData?.files ?? [])]
    if (!files.length) return
    e.preventDefault()
    const r = await attachmentsFromFiles(files)
    await addAttachments(r.attachments, r.skipped)
  })
  input.addEventListener('keydown', (e) => {
    if (mention) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        mention.index = (mention.index + (e.key === 'ArrowDown' ? 1 : -1) + mention.items.length) % mention.items.length
        return paintMention()
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.isComposing) return e.preventDefault(), insertMention(mention.index)
      if (e.key === 'Escape') return e.stopPropagation(), closeMention()
    }
    if (slash && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      slash.index = (slash.index + (e.key === 'ArrowDown' ? 1 : -1) + slash.items.length) % slash.items.length
      paintSlash()
    } else if (slash && (e.key === 'Tab' || (e.key === 'Enter' && !e.isComposing && input.value.trim() !== `/${slash.items[slash.index].name}`))) {
      e.preventDefault()
      pickSlash(slash.index)
    } else if (slashOpen() && e.key === 'Escape') {
      e.stopPropagation()
      closeSlash()
    } else if (e.key === 'Tab' && e.shiftKey) {
      if (plain) return
      e.preventDefault()
      cycleMode()
    } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      void submit()
    }
  })
  scroll.addEventListener('scroll', () => {
    mounted.stick = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80
    paintJump()
  })
  thread.addEventListener('click', (e) => {
    const runBtn = (e.target as HTMLElement).closest<HTMLElement>('.code-run')
    if (runBtn) {
      const block = runBtn.closest('.code')
      if (block) void runBlock(block, runBtn)
      return
    }
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
      new Frog(168).el,
      h('p', { class: 'hero-say' }, `“${SAYINGS[Math.floor(Math.random() * SAYINGS.length)]}”`),
      h('h1', null, plain ? 'What’s on your mind?' : 'What should we work on?'),
      plain ? null : h('p', { class: 'hero-path' }, tildify(view.cwd, state.home)),
      !plain && folder && !folder.instructions.length
        ? h('button', { class: 'hero-tip', type: 'button', onClick: () => (input.value = '/init', input.dispatchEvent(new Event('input')), input.focus()) }, 'No AGENTS.md yet. Type ', h('kbd', null, '/init'), ' and I will study the project and write one.')
        : null,
    )
    thread.append(mounted.hero)
  }
  for (const item of view.items) {
    const el = renderItem(item)
    mounted.els.set(item, el)
    thread.append(el)
  }
  thread.append(status)
  restoreRuns(thread, view.id)

  root.replaceChildren(
    h(
      'section',
      { class: 'chat' },
      h(
        'header',
        { class: 'chat-head drag' },
        h('button', { class: 'icon-btn no-drag show-when-hidden', type: 'button', title: 'Show sidebar (⌘B)', onClick: () => document.getElementById('app')?.classList.remove('sidebar-hidden') }, icon('sidebar', 17)),
        h('span', { class: 'chat-title' }, title),
        h('span', { class: 'chat-folder' }, plain ? '' : (folder?.name ?? '')),
        h('span', { class: 'push-right' }),
        contextRing(view),
        h('button', { class: 'icon-btn no-drag', type: 'button', title: 'Export chat as markdown', onClick: () => void exportCurrent() }, icon('share', 17)),
        ...(plain
          ? []
          : [
              h('button', { class: 'icon-btn no-drag btn-files', type: 'button', title: 'Files (⌘⇧E)', onClick: () => bus.files() }, icon('folder', 17)),
              h('button', { class: 'icon-btn no-drag btn-git', type: 'button', title: 'Git (⌘⇧G)', 'data-count': String(store.gitCount), onClick: () => bus.git() }, icon('branch', 17)),
              h('button', { class: 'icon-btn no-drag btn-browser', type: 'button', title: 'Browser (⌘⇧B)', onClick: () => bus.browser() }, icon('globe', 17)),
              h('button', { class: 'icon-btn no-drag btn-term', type: 'button', title: 'Terminal (⌘J)', onClick: () => bus.terminal() }, icon('terminal', 17)),
            ]),
      ),
      h('div', { class: 'scroll-wrap' }, scroll, jump),
      composerWrap,
    ),
  )
  composerWrap.append(
    tasks,
    queue,
    h('div', { class: 'composer' }, tray, input, voice.bar, h('button', { class: 'attach no-drag', type: 'button', title: 'Attach files or images', onClick: async () => { const r = await croo.pickAttachments(); await addAttachments(r.attachments, r.skipped) } }, icon('paperclip', 17)), voice.mic, send),
    h(
      'div',
      { class: 'composer-hint' },
      plain ? null : mode,
      plain
        ? h('span', { class: 'cwd' })
        : h('span', { class: 'cwd', 'data-tip': tildify(view.cwd, state.home) }, folder?.name ?? tildify(view.cwd, state.home)),
      plain || !folder ? null : instructionChip(folder.instructions, input),
      effort,
      chip,
    ),
  )
  bus.insert = (text) => {
    input.value = input.value ? `${input.value.replace(/\s*$/, ' ')}${text}` : text
    input.dispatchEvent(new Event('input'))
    input.focus()
  }
  paintStatus()
  paintQueue()
  paintTasks()
  refreshMode()
  paintTray()
  autosize()
  void profile
  requestAnimationFrame(() => {
    scroll.scrollTop = scroll.scrollHeight
    input.focus()
  })
}

// ---------- permission mode ----------

const MODES: { id: PermissionMode; label: string; icon: IconName; desc: string }[] = [
  { id: 'manual', label: 'Manual', icon: 'shield', desc: 'Asks before every action, even reading a file.' },
  { id: 'auto', label: 'Auto', icon: 'shieldCheck', desc: 'Reads, edits in this folder and safe commands just run. Anything else asks.' },
  { id: 'plan', label: 'Plan', icon: 'map', desc: 'Looks around without changing anything, then asks you to approve a plan.' },
  { id: 'bypass', label: 'Bypass', icon: 'bolt', desc: 'Never asks. Every command runs immediately.' },
]

export function refreshMode() {
  if (!m) return
  const cur = MODES.find((x) => x.id === store.state.permissionMode) ?? MODES[1]
  m.mode.className = `mode no-drag mode-${cur.id}`
  m.mode.dataset.tip = 'Permission mode'
  m.mode.dataset.key = '⇧Tab'
  m.mode.replaceChildren(icon(cur.icon, 14), h('span', null, cur.label), icon('chevronDown', 12))
  const { demo, profiles } = store.state
  const model = demo ? 'demo model' : (profiles.find((p) => p.active)?.model ?? 'no model')
  m.chip.dataset.tip = 'Switch model'
  m.chip.replaceChildren(h('span', null, model), icon('chevronDown', 11))

  // Effort only shows when the current model has such a setting.
  const levels = demo ? [] : (profiles.find((p) => p.active)?.efforts ?? [])
  m.effort.hidden = !levels.length
  if (levels.length) {
    const now = effectiveEffort(levels)
    m.effort.dataset.tip = 'Reasoning effort'
    m.effort.replaceChildren(icon('sparkle', 13), h('span', null, EFFORT_LABEL[now]), icon('chevronDown', 11))
  }
}

const EFFORT_LABEL: Record<Effort, string> = { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' }
const EFFORT_DESC: Record<Effort, string> = {
  auto: 'Let the model decide how much to think.',
  low: 'Fastest. Little thinking.',
  medium: 'Balanced for everyday work.',
  high: 'Thinks carefully. Good for coding.',
  xhigh: 'Extra depth for hard problems.',
  max: 'Deepest and slowest.',
}

/** What will actually be sent: the chosen level, or the nearest one this model accepts. */
function effectiveEffort(levels: Effort[]): Effort {
  const want = store.state.effort
  return want === 'auto' ? 'auto' : (clampEffort(want, levels) ?? 'auto')
}

function toggleEffortMenu() {
  const existing = document.querySelector('.effort-menu')
  if (existing) return existing.remove()
  const levels = store.state.profiles.find((p) => p.active)?.efforts ?? []
  if (!levels.length || !m) return
  const now = effectiveEffort(levels)
  const close = () => {
    menu.remove()
    document.removeEventListener('mousedown', outside, true)
    document.removeEventListener('keydown', esc, true)
  }
  const outside = (e: MouseEvent) => !menu.contains(e.target as Node) && !m?.effort.contains(e.target as Node) && close()
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), close())
  const menu = h(
    'div',
    { class: 'effort-menu', role: 'menu' },
    (['auto', ...levels] as Effort[]).map((l) =>
      h(
        'button',
        { class: `mode-item ${l === now ? 'on' : ''}`, type: 'button', role: 'menuitemradio', onClick: () => (void croo.setEffort(l), close()) },
        h('span', { class: 'mode-text' }, h('b', null, EFFORT_LABEL[l]), h('small', null, EFFORT_DESC[l])),
        l === now ? icon('check', 15) : null,
      ),
    ),
  )
  m.mode.closest('.composer-wrap')?.append(menu)
  document.addEventListener('mousedown', outside, true)
  document.addEventListener('keydown', esc, true)
}

/** Which AGENTS.md / CLAUDE.md files Croo is reading here, or a nudge to create one. */
function instructionChip(files: string[], input: HTMLTextAreaElement): HTMLElement {
  if (files.length) {
    return h('span', { class: 'inst', 'data-tip': 'Croo reads these at the start of every turn', 'data-key': '' }, icon('file', 12), files.join(' · '))
  }
  return h('button', { class: 'inst none no-drag', type: 'button', 'data-tip': 'Have Croo study the project and write AGENTS.md', onClick: () => (input.value = '/init', input.dispatchEvent(new Event('input')), input.focus()) }, icon('file', 12), '/init')
}

// ---------- slash commands ----------

/** Built-in and custom commands per folder, loaded when a chat opens. */
const commandCache = new Map<string, SlashCommand[]>()
let slash: { items: SlashCommand[]; index: number } | null = null

export function loadSlashCommands(cwd: string) {
  void croo.listCommands(cwd).then((list) => commandCache.set(cwd, list))
}

const slashOpen = () => !!slash
function closeSlash() {
  slash = null
  document.querySelector('.slash-menu')?.remove()
}

function updateSlash() {
  if (!m || m.view.kind === 'chat') return
  const typed = /^\/([\w-]*)$/.exec(m.input.value)
  const items = typed ? (commandCache.get(m.view.cwd) ?? []).filter((c) => c.name.startsWith(typed[1])) : []
  if (!items.length) return closeSlash()
  const keep = slash?.items[slash.index]?.name
  slash = { items, index: Math.max(0, items.findIndex((c) => c.name === keep)) }
  paintSlash()
}

function paintSlash() {
  if (!m || !slash) return
  const s = slash
  document.querySelector('.slash-menu')?.remove()
  m.mode.closest('.composer-wrap')?.append(
    h(
      'div',
      { class: 'slash-menu', role: 'listbox' },
      s.items.map((c, i) =>
        h(
          'button',
          { class: `slash-item ${i === s.index ? 'on' : ''}`, type: 'button', role: 'option', onMousedown: (e: Event) => e.preventDefault(), onClick: () => pickSlash(i) },
          h('b', null, `/${c.name}`),
          h('span', null, c.description, c.argumentHint ? h('small', null, ` ${c.argumentHint}`) : null),
          c.source !== 'builtin' ? h('small', { class: 'slash-src' }, c.source === 'project' ? 'project' : 'yours') : null,
          i === s.index ? h('kbd', null, '⇥') : null,
        ),
      ),
    ),
  )
  document.querySelector('.slash-item.on')?.scrollIntoView({ block: 'nearest' })
}

function pickSlash(i: number) {
  if (!m || !slash) return
  m.input.value = `/${slash.items[i].name} `
  closeSlash()
  m.input.dispatchEvent(new Event('input'))
  m.input.focus()
}

function cycleMode() {
  const i = MODES.findIndex((x) => x.id === store.state.permissionMode)
  void croo.setMode(MODES[(i + 1) % MODES.length].id)
}

function toggleModeMenu() {
  const existing = document.querySelector('.mode-menu')
  if (existing) return existing.remove()
  const close = () => {
    menu.remove()
    document.removeEventListener('mousedown', outside, true)
    document.removeEventListener('keydown', esc, true)
  }
  const outside = (e: MouseEvent) => !menu.contains(e.target as Node) && !m?.mode.contains(e.target as Node) && close()
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), close())
  const menu = h(
    'div',
    { class: 'mode-menu', role: 'menu' },
    MODES.map((x) =>
      h(
        'button',
        { class: `mode-item mode-${x.id} ${x.id === store.state.permissionMode ? 'on' : ''}`, type: 'button', role: 'menuitemradio', onClick: () => (void croo.setMode(x.id), close()) },
        icon(x.icon, 16),
        h('span', { class: 'mode-text' }, h('b', null, x.label), h('small', null, x.desc)),
        x.id === store.state.permissionMode ? icon('check', 15) : null,
      ),
    ),
  )
  m?.mode.closest('.composer-wrap')?.append(menu)
  document.addEventListener('mousedown', outside, true)
  document.addEventListener('keydown', esc, true)
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
