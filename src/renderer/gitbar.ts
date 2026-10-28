import type { GitResult, GitStatus } from '../shared/ipc.js'
import { h, icon, type IconName } from './dom.js'
import { quickAction, totals, type QuickKind } from './gitquick.js'
import { bus, croo } from './store.js'

/**
 * The repository controls in the chat header: a "3 +40 −2" summary that opens the Changes panel, and a split
 * button whose main action is whatever makes sense next (commit and push, pull, publish...), with the rest in its menu.
 */

const ICON: Record<QuickKind, IconName> = { commit: 'check', 'commit-push': 'cloudUp', push: 'cloudUp', pull: 'arrowDown', publish: 'external', 'create-pr': 'pr', none: 'check' }

let cwd: string | undefined
let status: GitStatus | null = null
/** What a running action is doing, shown in place of the button's label. */
let progress: string | null = null
let result: { ok: boolean; text: string; url?: string; output?: string } | null = null
let resultTimer = 0
const listeners = new Set<(s: GitStatus | null) => void>()

export const gitStatusNow = () => status

/** The Changes panel repaints when the status does. */
export function onGitStatus(cb: (s: GitStatus | null) => void) {
  listeners.add(cb)
}

export function applyGitStatus(at: string | undefined, s: GitStatus | null) {
  if (at !== cwd) result = null
  cwd = at
  status = s
  paintBars()
  for (const cb of listeners) cb(s)
}

const subject = (message: string) => message.split('\n')[0]

/** Run a step, showing what it is doing; a failed git step stops the rest. */
async function step(label: string, fn: () => Promise<GitResult>): Promise<GitResult> {
  progress = label
  paintBars()
  return fn()
}

/** Commit every change with an AI-written message. Returns the message, or null after showing what went wrong. */
async function commitAll(at: string, s: GitStatus): Promise<string | null> {
  progress = 'Writing message…'
  paintBars()
  const paths = s.files.map((f) => f.path)
  const msg = await croo.suggestCommit(at, paths)
  if (!msg.ok) {
    fail({ ok: false, output: msg.error, hint: `Could not write a commit message: ${msg.error}` })
    return null
  }
  const res = await step('Committing…', () => croo.gitCommit(at, paths, msg.message))
  if (!res.ok) {
    fail(res)
    return null
  }
  return msg.message
}

function fail(res: GitResult) {
  show({ ok: false, text: res.hint ?? 'Git could not finish that.', output: res.output })
}

function show(r: NonNullable<typeof result>) {
  result = r
  clearTimeout(resultTimer)
  // Good news goes away on its own; a failure waits for you.
  if (r.ok && !r.url) resultTimer = window.setTimeout(() => ((result = null), paintBars()), 5000)
}

export async function runGit(kind: Exclude<QuickKind, 'none'> | 'commit-only') {
  const at = cwd
  const s = status
  if (!at || !s || progress) return
  result = null
  try {
    if (kind === 'publish') return bus.changes({ publish: true })
    if (kind === 'commit' || kind === 'commit-only' || kind === 'commit-push') {
      const msg = await commitAll(at, s)
      if (!msg) return
      if (kind !== 'commit-push') return show({ ok: true, text: `Committed “${subject(msg)}”` })
      const pushed = await step('Pushing…', () => croo.gitPush(at, !!s.upstream))
      if (!pushed.ok) return fail({ ...pushed, hint: `Committed “${subject(msg)}”, but the push failed. ${pushed.hint ?? ''}`.trim() })
      return show({ ok: true, text: `Committed and pushed “${subject(msg)}”` })
    }
    if (kind === 'push') {
      const r = await step('Pushing…', () => croo.gitPush(at, !!s.upstream))
      return r.ok ? show({ ok: true, text: s.upstream ? `Pushed to ${s.upstream}` : 'Branch published' }) : fail(r)
    }
    if (kind === 'pull') {
      const r = await step('Pulling…', () => croo.gitPull(at))
      return r.ok ? show({ ok: true, text: r.output.split('\n').pop() || 'Pulled' }) : fail(r)
    }
    if (kind === 'create-pr') {
      const r = await step('Opening pull request…', () => croo.gitCreatePr(at))
      if (!r.ok) return fail(r)
      if (r.url) void croo.openExternal(r.url)
      return show({ ok: true, text: r.output, url: r.url })
    }
  } finally {
    progress = null
    await bus.gitRefresh()
    paintBars()
  }
}

// ---------- the header element ----------

/** A fresh copy for a chat header. Every copy is repainted together. */
export function gitBar(): HTMLElement {
  const el = h('div', { class: 'gitbar no-drag' })
  queueMicrotask(() => paintBar(el))
  return el
}

function paintBars() {
  for (const el of document.querySelectorAll<HTMLElement>('.gitbar')) paintBar(el)
}

function paintBar(el: HTMLElement) {
  const q = quickAction(status)
  el.hidden = !q
  if (!q || !status) return el.replaceChildren()
  const s = status
  const { add, del } = totals(s)
  const summary = s.files.length
    ? h(
        'button',
        { class: 'git-sum', type: 'button', 'aria-label': `${s.files.length} files changed, ${add} additions, ${del} deletions. Open Changes.`, 'data-tip': 'Review changes (⌘⇧G)', onClick: () => bus.git() },
        icon('diff', 14),
        h('span', { class: 'n' }, String(s.files.length)),
        h('span', { class: 'add' }, `+${add}`),
        h('span', { class: 'del' }, `−${del}`),
      )
    : null
  const busy = !!progress
  const main = h(
    'button',
    { class: 'git-main', type: 'button', disabled: busy || q.kind === 'none', 'data-tip': q.tip, onClick: () => q.kind !== 'none' && void runGit(q.kind) },
    busy ? h('span', { class: 'spinner' }) : icon(ICON[q.kind], 14),
    h('span', null, progress ?? q.label),
  )
  const more = h('button', { class: 'git-more', type: 'button', disabled: busy, 'aria-label': 'More git actions', 'aria-haspopup': 'menu', onClick: () => toggleMenu(el) }, icon('chevronDown', 12))
  el.replaceChildren(...(summary ? [summary] : []), h('div', { class: `git-split ${q.kind === 'none' ? 'idle' : ''}` }, main, more), ...(result ? [resultPop()] : []))
}

function resultPop(): HTMLElement {
  const r = result!
  const close = () => ((result = null), paintBars())
  return h(
    'div',
    { class: `git-pop ${r.ok ? 'ok' : 'bad'}`, role: r.ok ? 'status' : 'alert' },
    h('div', { class: 'git-pop-head' }, icon(r.ok ? 'check' : 'x', 14), h('span', null, r.text), h('button', { class: 'icon-btn small', type: 'button', title: 'Dismiss', onClick: close }, icon('x', 13))),
    !r.ok && r.output && r.output !== r.text ? h('pre', null, r.output) : null,
    r.url ? h('button', { class: 'btn small', type: 'button', onClick: () => void croo.openExternal(r.url!) }, icon('external', 13), 'Open pull request') : null,
    !r.ok
      ? h(
          'div',
          { class: 'git-pop-actions' },
          h('button', { class: 'btn small', type: 'button', title: 'Put the error in the message box without sending it', onClick: () => (bus.insert(`Git error output:\n${r.output || r.text}\n\nHelp me diagnose and fix the git failure above.`), close()) }, icon('message', 13), 'Fix in chat'),
          h('button', { class: 'btn ghost small', type: 'button', onClick: close }, 'Close'),
        )
      : null,
  )
}

function toggleMenu(bar: HTMLElement) {
  const existing = document.querySelector('.git-menu')
  if (existing) return existing.remove()
  const s = status
  if (!s) return
  const remote = s.remotes.length > 0
  const close = () => {
    menu.remove()
    document.removeEventListener('mousedown', outside, true)
    document.removeEventListener('keydown', esc, true)
  }
  const outside = (e: MouseEvent) => !menu.contains(e.target as Node) && !bar.querySelector('.git-more')?.contains(e.target as Node) && close()
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), close())
  const item = (ic: IconName, label: string, enabled: boolean, run: () => void, note?: string) =>
    h('button', { class: 'menu-item', type: 'button', role: 'menuitem', disabled: !enabled, onClick: () => (close(), run()) }, icon(ic, 14), h('span', null, label), note ? h('small', null, note) : null)
  const menu = h(
    'div',
    { class: 'git-menu', role: 'menu' },
    item('check', 'Commit', s.files.length > 0, () => void runGit('commit-only'), s.files.length ? `${s.files.length} file${s.files.length === 1 ? '' : 's'}` : undefined),
    item('cloudUp', 'Commit & push', s.files.length > 0 && remote, () => void runGit('commit-push')),
    item('cloudUp', 'Push', remote && s.hasCommits && (!s.upstream || s.ahead > 0), () => void runGit('push'), s.ahead ? `↑${s.ahead}` : undefined),
    item('arrowDown', 'Pull', !!s.upstream, () => void runGit('pull'), s.behind ? `↓${s.behind}` : undefined),
    h('div', { class: 'menu-sep' }),
    remote
      ? item('pr', 'Create pull request', s.gh && !!s.defaultBranch && s.branch !== s.defaultBranch, () => void runGit('create-pr'), !s.gh ? 'needs gh' : s.branch === s.defaultBranch ? `on ${s.branch}` : undefined)
      : item('external', 'Publish to GitHub…', s.hasCommits, () => bus.changes({ publish: true })),
    item('diff', 'View changes', true, () => bus.changes()),
  )
  bar.append(menu)
  document.addEventListener('mousedown', outside, true)
  document.addEventListener('keydown', esc, true)
}
