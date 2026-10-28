import type { FsEntry, FsFile, GitFile } from '../shared/ipc.js'
import { h, icon, tildify } from './dom.js'
import { Frog } from './frog.js'
import { parseDiff, statusLabel } from './gitdiff.js'
import { applyGitStatus, gitStatusNow, onGitStatus } from './gitbar.js'
import { highlightLines } from './highlight.js'
import { bus, croo, remember, store } from './store.js'

type Tab = 'files' | 'browser' | 'git'

let panel: HTMLElement
let tab: Tab | null = null
let cwd: string | undefined

const app = () => document.getElementById('app')!

// ---------- panel shell ----------

export function initSide() {
  panel = document.getElementById('side')!
  const grip = h('div', { class: 'side-resize' })
  panel.append(grip, h('div', { class: 'side-body' }))
  const saved = Number(remember.get('sideWidth'))
  if (saved >= 300) panel.style.setProperty('--side-w', `${saved}px`)
  grip.addEventListener('mousedown', (down) => {
    down.preventDefault()
    const startX = down.clientX
    const startW = panel.getBoundingClientRect().width
    const move = (e: MouseEvent) => panel.style.setProperty('--side-w', `${Math.min(Math.max(startW + startX - e.clientX, 300), window.innerWidth * 0.7)}px`)
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      remember.set('sideWidth', String(Math.round(panel.getBoundingClientRect().width)))
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  })
  bus.files = () => toggleSide('files')
  bus.browser = () => toggleSide('browser')
  bus.git = () => toggleSide('git')
  bus.changes = (opts) => {
    if (tab !== 'git') toggleSide('git')
    gitPanel.publish(!!opts?.publish)
  }
  bus.gitRefresh = refreshGit
  // Things change on disk while you are elsewhere: look again when the window comes back.
  window.addEventListener('focus', () => void refreshGit())
  bus.insert = () => {}
}

export function toggleSide(next: Tab) {
  if (tab === next) return closeSide()
  tab = next
  panel.hidden = false
  const a = app()
  a.classList.add('side-open')
  a.classList.toggle('side-files', next === 'files')
  a.classList.toggle('side-browser', next === 'browser')
  a.classList.toggle('side-git', next === 'git')
  // Make room: on a narrow window the sidebar steps aside.
  if (window.innerWidth - (a.classList.contains('sidebar-hidden') ? 0 : 256) - panel.getBoundingClientRect().width < 420) a.classList.add('sidebar-hidden')
  render()
}

export function closeSide() {
  tab = null
  panel.hidden = true
  const a = app()
  a.classList.remove('side-open', 'side-files', 'side-browser', 'side-git')
}

/** The code chat in front changed: the file tree follows its folder. */
export function setFolder(next: string | undefined) {
  if (next === cwd) return
  cwd = next
  tree.reset()
  gitPanel.reset()
  applyGitStatus(next, null)
  if (!next) return closeSide()
  void refreshGit()
  if (tab === 'files' || tab === 'git') render()
}

/** Look at the repository again (after a turn, a command, or coming back to the window). */
export async function refreshGit() {
  if (!cwd) return
  const at = cwd
  try {
    const st = await croo.gitStatus(at)
    if (at === cwd) applyGitStatus(at, st)
  } catch {}
}

/** Show a file in the Files panel (from search results or a mention). */
export async function openFileInPanel(rel: string) {
  if (tab !== 'files') toggleSide('files')
  await tree.openRel(rel)
}

export function refreshFiles() {
  if (tab === 'files' && !tree.viewing) void tree.reload()
}

function render() {
  const body = panel.querySelector<HTMLElement>('.side-body')!
  if (tab === 'files') body.replaceChildren(tree.view())
  else if (tab === 'git') body.replaceChildren(gitPanel.view())
  else if (tab === 'browser') body.replaceChildren(browser.view())
  else body.replaceChildren()
  if (tab === 'browser') browser.focusAddress()
}

const head = (title: string, ...actions: (Node | null)[]) =>
  h('div', { class: 'side-head' }, h('span', { class: 'side-title' }, title), h('span', { class: 'push-right' }), ...actions, h('button', { class: 'icon-btn small no-drag', type: 'button', title: 'Close', onClick: closeSide }, icon('x', 15)))

// ---------- files ----------

const tree = (() => {
  const open = new Set<string>()
  const cache = new Map<string, FsEntry[]>()
  let host: HTMLElement | null = null
  let viewing: FsFile | null = null

  const load = async (rel: string) => {
    if (!cwd) return []
    try {
      const list = await croo.fsList(cwd, rel)
      cache.set(rel, list)
      return list
    } catch {
      cache.set(rel, [])
      return []
    }
  }

  const rows = (rel: string, depth: number): HTMLElement[] =>
    (cache.get(rel) ?? []).flatMap((e) => {
      const isOpen = open.has(e.rel)
      const row = h(
        'div',
        {
          class: `file-row ${e.dir ? 'dir' : ''}`,
          style: `padding-left:${10 + depth * 14}px`,
          role: 'treeitem',
          tabindex: 0,
          onClick: () => void (e.dir ? toggleDir(e) : openFile(e)),
          onKeydown: (k: KeyboardEvent) => k.key === 'Enter' && void (e.dir ? toggleDir(e) : openFile(e)),
        },
        e.dir ? icon('chevron', 11) : h('span', { class: 'file-gap' }),
        icon(e.dir ? 'folder' : 'file', 14),
        h('span', { class: 'file-name' }, e.name),
      )
      if (e.dir && isOpen) row.classList.add('open')
      return [row, ...(e.dir && isOpen ? rows(e.rel, depth + 1) : [])]
    })

  const paint = () => {
    if (!host) return
    const list = host.querySelector<HTMLElement>('.file-tree')!
    const empty = !(cache.get('') ?? []).length
    list.replaceChildren(...(empty ? [h('div', { class: 'side-empty' }, cache.has('') ? 'This folder is empty.' : 'Loading…')] : rows('', 0)))
  }

  const toggleDir = async (e: FsEntry) => {
    if (open.has(e.rel)) open.delete(e.rel)
    else {
      open.add(e.rel)
      if (!cache.has(e.rel)) await load(e.rel)
    }
    paint()
  }

  const openFile = async (e: FsEntry) => {
    if (!cwd) return
    viewing = await croo.fsRead(cwd, e.rel)
    if (viewing) show()
  }

  const openRel = async (rel: string) => {
    if (!cwd) return
    viewing = await croo.fsRead(cwd, rel)
    if (viewing) show()
  }

  const reload = async () => {
    const dirs = ['', ...open]
    await Promise.all(dirs.map(load))
    paint()
  }

  const fileView = (f: FsFile): HTMLElement => {
    const name = f.rel.split('/').pop() ?? f.rel
    const ext = name.includes('.') ? name.split('.').pop()! : name.toLowerCase()
    let body: HTMLElement
    if (f.kind === 'image') body = h('div', { class: 'viewer-image' }, h('img', { src: f.dataUrl, alt: name }))
    else if (f.kind === 'binary') body = h('div', { class: 'side-empty' }, `Can’t preview this file (${Math.round(f.size / 1024)} KB).`)
    else {
      const lines = highlightLines(f.text ?? '', ext)
      // One row per line, so long lines wrap and the line number stays beside the first part of it.
      body = h('div', { class: 'viewer' }, lines.map((html, i) => h('div', { class: 'vrow' }, h('span', { class: 'ln', 'aria-hidden': 'true' }, String(i + 1)), h('code', { class: 'hljs lc', html: html || ' ' }))))
      if (f.truncated) body.append(h('div', { class: 'side-empty' }, 'Showing the first 400 KB.'))
    }
    return h(
      'div',
      { class: 'side-col' },
      h(
        'div',
        { class: 'side-head' },
        h('button', { class: 'icon-btn small no-drag', type: 'button', title: 'Back to files', onClick: () => ((viewing = null), show()) }, icon('back', 16)),
        h('span', { class: 'side-title mono', 'data-tip': f.rel }, name),
        h('span', { class: 'push-right' }),
        h('button', { class: 'icon-btn small no-drag', type: 'button', title: 'Ask Croo about this file', onClick: () => bus.insert(`@${f.rel} `) }, icon('message', 15)),
        h('button', { class: 'icon-btn small no-drag', type: 'button', title: 'Show in Finder', onClick: () => cwd && void croo.reveal(cwd, f.rel) }, icon('external', 15)),
        h('button', { class: 'icon-btn small no-drag', type: 'button', title: 'Close', onClick: closeSide }, icon('x', 15)),
      ),
      body,
    )
  }

  const show = () => {
    const body = panel.querySelector<HTMLElement>('.side-body')!
    body.replaceChildren(viewing ? fileView(viewing) : view())
  }

  const view = (): HTMLElement => {
    host = h(
      'div',
      { class: 'side-col' },
      head(
        'Files',
        h('button', { class: 'icon-btn small no-drag', type: 'button', title: 'Refresh', onClick: () => void reload() }, icon('refresh', 15)),
      ),
      cwd ? h('div', { class: 'side-sub mono' }, tildify(cwd, store.state.home)) : null,
      h('div', { class: 'file-tree', role: 'tree' }),
    )
    if (viewing) return fileView(viewing)
    paint()
    void load('').then(paint)
    return host
  }

  return {
    view,
    reload,
    openRel,
    reset() {
      open.clear()
      cache.clear()
      viewing = null
    },
    get viewing() {
      return viewing
    },
  }
})()

// ---------- changes ----------

/**
 * What changed in the folder, Kilo style: a filterable list of files on top and every file's diff below it, one
 * after the other. Committing and pushing live in the header (gitbar.ts); the card to connect a remote lives here.
 */
const gitPanel = (() => {
  const diffs = new Map<string, string>()
  /** Each file's line counts when its diff was fetched: a diff is fetched again only when they move. */
  const seen = new Map<string, string>()
  let filter = ''
  let focus: string | null = null
  let publishing = false
  let busy = false
  let note: { ok: boolean; text: string } | null = null
  let top: HTMLElement | null = null
  let list: HTMLElement | null = null
  let stream: HTMLElement | null = null
  let publishCard: HTMLElement | null = null
  let watcher: IntersectionObserver | null = null

  const status = () => gitStatusNow()
  const files = () => status()?.files ?? []
  const shown = () => files().filter((f) => !filter || f.path.toLowerCase().includes(filter.toLowerCase()))

  /** Connect or create a remote, then push. Used by the Publish card. */
  const publish = async (how: { remote: string } | { name: string; isPrivate: boolean }) => {
    if (!cwd || busy) return
    busy = true
    note = null
    paintPublish()
    const res = 'remote' in how ? await croo.gitConnect(cwd, how.remote) : await croo.gitPublish(cwd, how.name, how.isPrivate)
    busy = false
    note = { ok: res.ok, text: res.hint ? (res.output ? `${res.hint}\n\n${res.output}` : res.hint) : res.output }
    if (res.ok) publishing = false
    await refreshGit()
  }

  const load = async (f: GitFile) => {
    if (!cwd || diffs.has(f.path)) return
    const at = cwd
    const text = await croo.gitDiff(at, f.path, f.index === '?')
    if (at !== cwd) return
    diffs.set(f.path, text)
    const body = stream?.querySelector<HTMLElement>(`[data-path="${CSS.escape(f.path)}"] .git-diff`)
    if (body) body.replaceWith(diffView(f))
  }

  const diffView = (f: GitFile): HTMLElement => {
    const text = diffs.get(f.path)
    if (text === undefined) return h('div', { class: 'git-diff note' }, 'Loading…')
    const { rows, binary } = parseDiff(text)
    if (binary) return h('div', { class: 'git-diff note' }, 'Binary file.')
    if (!rows.length) return h('div', { class: 'git-diff note' }, f.work === 'D' || f.index === 'D' ? 'File deleted.' : 'No textual changes.')
    return h(
      'div',
      { class: 'git-diff' },
      rows.map((r) =>
        r.type === 'hunk'
          ? h('div', { class: 'dl gap' }, '⋯ ', r.text)
          : h('div', { class: `dl ${r.type === 'add' ? 'add' : r.type === 'del' ? 'del' : ''}` }, h('span', { class: 'no' }, String(r.no ?? '')), h('span', { class: 'sign' }, r.type === 'add' ? '+' : r.type === 'del' ? '−' : ''), h('span', { class: 'tx' }, r.text || ' ')),
      ),
    )
  }

  const counts = (f: GitFile) => (f.add !== undefined || f.del !== undefined ? h('span', { class: 'git-counts' }, h('b', { class: 'add' }, `+${f.add ?? 0}`), h('b', { class: 'del' }, `−${f.del ?? 0}`)) : null)

  /** A file in the list: a click brings its diff into view. */
  const fileRow = (f: GitFile): HTMLElement => {
    const { letter, word } = statusLabel(f.index, f.work)
    const slash = f.path.lastIndexOf('/')
    return h(
      'button',
      { class: `git-row ${focus === f.path ? 'on' : ''}`, type: 'button', onClick: () => jump(f.path) },
      h('span', { class: `git-badge s-${letter}`, 'data-tip': word }, letter),
      h('span', { class: 'git-name', 'data-tip': f.orig ? `${f.orig} → ${f.path}` : f.path }, f.path.slice(slash + 1), slash >= 0 ? h('small', null, f.path.slice(0, slash)) : null),
      counts(f),
    )
  }

  /** A file's diff in the stream, under a header that stays put while you scroll through it. */
  const section = (f: GitFile): HTMLElement => {
    const { letter } = statusLabel(f.index, f.work)
    return h(
      'section',
      { class: 'git-sec', 'data-path': f.path },
      h(
        'div',
        { class: 'git-sec-head' },
        h('span', { class: `git-badge s-${letter}` }, letter),
        h('span', { class: 'git-sec-name mono', title: f.path }, f.path),
        counts(f),
        h('span', { class: 'push-right' }),
        h('button', { class: 'icon-btn small', type: 'button', title: 'Ask Croo about this change', onClick: () => bus.insert(`@${f.path} `) }, icon('message', 14)),
        f.work !== 'D' && f.index !== 'D' ? h('button', { class: 'icon-btn small', type: 'button', title: 'Open file', onClick: () => void openFileInPanel(f.path) }, icon('file', 14)) : null,
      ),
      diffView(f),
    )
  }

  const jump = (path: string) => {
    focus = path
    paintList()
    stream?.querySelector(`[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const paintTop = () => {
    const s = status()
    if (!top) return
    if (!s?.repo) return top.replaceChildren()
    top.replaceChildren(
      h('span', { class: 'branch', 'data-tip': s.upstream ? `Tracking ${s.upstream}` : 'No upstream yet' }, icon('branch', 13), s.branch || 'HEAD'),
      s.ahead || s.behind
        ? h('span', { class: 'sync' }, s.ahead ? h('b', { 'data-tip': `${s.ahead} to push` }, `↑${s.ahead}`) : null, s.behind ? h('b', { 'data-tip': `${s.behind} to pull` }, `↓${s.behind}`) : null)
        : h('span', { class: 'sync' }, s.upstream ? 'up to date' : s.remotes.length ? 'not pushed yet' : 'no remote'),
      h('span', { class: 'push-right' }),
      ...(files().length > 6
        ? [h('input', { class: 'input small git-filter', placeholder: 'Filter files', value: filter, spellcheck: 'false', 'aria-label': 'Filter changed files', onInput: (e: Event) => ((filter = (e.target as HTMLInputElement).value), paintList(), paintStream()) })]
        : []),
    )
  }

  const paintList = () => {
    if (!list) return
    const s = status()
    list.hidden = !s?.repo || !files().length
    if (!list.hidden) list.replaceChildren(...shown().map(fileRow))
  }

  const paintStream = () => {
    if (!stream) return
    const s = status()
    watcher?.disconnect()
    if (!s) return stream.replaceChildren(h('div', { class: 'side-empty' }, 'Loading…'))
    if (!s.repo) {
      return stream.replaceChildren(
        h(
          'div',
          { class: 'git-empty' },
          new Frog(84).el,
          h('p', null, 'This folder is not a git repository.'),
          h('button', { class: 'btn', type: 'button', onClick: async () => cwd && (await croo.gitInit(cwd), await refreshGit()) }, icon('branch', 14), 'Initialize repository'),
        ),
      )
    }
    if (!files().length) return stream.replaceChildren(h('div', { class: 'git-empty' }, new Frog(84, 'happy').el, h('p', null, 'Nothing to commit. Working tree clean.')))
    const secs = shown().map(section)
    stream.replaceChildren(...secs)
    // Diffs load as they scroll into view, so a big change set opens instantly.
    watcher = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const f = files().find((x) => x.path === (e.target as HTMLElement).dataset.path)
          if (f) void load(f)
          watcher?.unobserve(e.target)
        }
      },
      { root: stream, rootMargin: '400px 0px' },
    )
    for (const el of secs) watcher.observe(el)
  }

  const paintPublish = () => {
    if (!publishCard) return
    const s = status()
    const noRemote = !!s?.repo && !s.remotes.length
    publishCard.hidden = !(noRemote && publishing)
    if (publishCard.hidden) return
    const name = h('input', { class: 'input small', value: (cwd ?? '').split('/').filter(Boolean).pop() ?? 'project', spellcheck: 'false', 'aria-label': 'Repository name' })
    let priv = true
    const vis = h('div', { class: 'seg mini' })
    const paintVis = () =>
      vis.replaceChildren(
        h('button', { class: `seg-text ${priv ? 'on' : ''}`, type: 'button', onClick: () => ((priv = true), paintVis()) }, 'Private'),
        h('button', { class: `seg-text ${priv ? '' : 'on'}`, type: 'button', onClick: () => ((priv = false), paintVis()) }, 'Public'),
      )
    paintVis()
    const url = h('input', { class: 'input small', placeholder: 'you/project or a full URL', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Remote address' })
    const go = () => url.value.trim() && void publish({ remote: url.value })
    url.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), go()))
    publishCard.replaceChildren(
      h('div', { class: 'git-publish-title' }, 'Connect this folder to a remote', h('span', { class: 'push-right' }), h('button', { class: 'icon-btn small', type: 'button', title: 'Close', onClick: () => ((publishing = false), paintPublish()) }, icon('x', 13))),
      ...(s?.gh
        ? [
            h('div', { class: 'inline-row' }, name, vis),
            h('button', { class: 'btn primary', type: 'button', disabled: busy, onClick: () => void publish({ name: name.value.trim(), isPrivate: priv }) }, busy ? h('span', { class: 'spinner' }) : icon('external', 14), 'Create on GitHub and push'),
            h('div', { class: 'git-or' }, 'or use an existing repository'),
          ]
        : [h('p', { class: 'muted' }, 'Create an empty repository on GitHub (or anywhere), then paste its address here. Install the GitHub CLI (gh) to create one from here.')]),
      h('div', { class: 'inline-row' }, url, h('button', { class: 'btn', type: 'button', disabled: busy, onClick: go }, 'Connect & push')),
      ...(note ? [h('pre', { class: `git-note ${note.ok ? 'ok' : 'bad'}` }, note.text)] : []),
    )
  }

  const paint = () => {
    if (!stream?.isConnected) return
    const s = status()
    // A file that is no longer changed, or whose line counts moved, loses its cached diff.
    const now = new Map((s?.files ?? []).map((f) => [f.path, `${f.index}${f.work}${f.add}/${f.del}`]))
    for (const p of [...diffs.keys()]) if (now.get(p) !== seen.get(p)) diffs.delete(p)
    for (const [p, sig] of now) seen.set(p, sig)
    const title = panel.querySelector('.side-title')
    if (title) title.textContent = s?.files.length ? `Changes ${s.files.length}` : 'Changes'
    paintTop()
    paintPublish()
    paintList()
    paintStream()
  }

  const view = (): HTMLElement => {
    top = h('div', { class: 'git-top' })
    list = h('div', { class: 'git-files', role: 'list' })
    stream = h('div', { class: 'git-stream' })
    publishCard = h('div', { class: 'git-publish', hidden: true })
    const el = h(
      'div',
      { class: 'side-col changes' },
      head('Changes', h('button', { class: 'icon-btn small no-drag', type: 'button', title: 'Refresh', onClick: () => (diffs.clear(), void refreshGit()) }, icon('refresh', 15))),
      top,
      publishCard,
      list,
      stream,
    )
    queueMicrotask(paint)
    return el
  }

  onGitStatus(() => paint())

  return {
    view,
    publish(on: boolean) {
      publishing = on
      paintPublish()
    },
    reset() {
      diffs.clear()
      seen.clear()
      filter = ''
      focus = null
      note = null
      publishing = false
    },
  }
})()

// ---------- browser ----------

/** What you typed becomes a URL: web addresses and localhost ports are opened, anything else is searched. */
export function toUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (/^https?:\/\//i.test(t)) return t
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^(localhost|127\.0\.0\.1):\d+/i.test(t)) return /^\w+:\/\//.test(t) ? null : `https://duckduckgo.com/?q=${encodeURIComponent(t)}`
  if (/^:?\d{2,5}(\/.*)?$/.test(t)) return `http://localhost:${t.replace(/^:/, '')}`
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(t)) return `http://${t}`
  if (!t.includes(' ') && /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(t)) return `https://${t}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`
}

const browser = (() => {
  let wv: Electron.WebviewTag | null = null
  let root: HTMLElement | null = null
  let address: HTMLInputElement
  let start: HTMLElement
  let loading = false
  let current = ''

  const go = (raw: string) => {
    const url = toUrl(raw)
    if (!url || !wv) return
    start.hidden = true
    wv.hidden = false
    if (wv.src && wv.src !== 'about:blank') void wv.loadURL(url).catch(() => {})
    else wv.src = url
    address.value = url
    current = url
  }

  const sync = () => {
    if (!root) return
    const can = (fn: () => boolean) => {
      try {
        return fn()
      } catch {
        return false
      }
    }
    root.querySelector<HTMLButtonElement>('.nav-back')!.disabled = !can(() => wv!.canGoBack())
    root.querySelector<HTMLButtonElement>('.nav-fwd')!.disabled = !can(() => wv!.canGoForward())
    const reload = root.querySelector<HTMLButtonElement>('.nav-reload')!
    reload.replaceChildren(icon(loading ? 'x' : 'refresh', 15))
    reload.dataset.tip = loading ? 'Stop' : 'Reload'
    root.classList.toggle('loading', loading)
  }

  const startPage = (): HTMLElement => {
    const chips = h('div', { class: 'start-chips' })
    void croo.probePorts().then((ports) => {
      chips.replaceChildren(
        ...(ports.length
          ? [h('div', { class: 'start-label' }, 'Running on this Mac'), ...ports.map((p) => h('button', { class: 'start-chip', type: 'button', onClick: () => go(`localhost:${p}`) }, icon('globe', 13), `localhost:${p}`))]
          : [h('div', { class: 'start-label' }, 'No dev servers running. Start one in the terminal and it shows up here.')]),
      )
    })
    return h('div', { class: 'start' }, new Frog(84).el, h('h2', null, 'Browser'), h('p', null, 'Open a page, or preview what you are building.'), chips)
  }

  const view = (): HTMLElement => {
    address = h('input', {
      class: 'address no-drag',
      placeholder: 'Search or enter address',
      spellcheck: 'false',
      autocapitalize: 'off',
      onKeydown: (e: KeyboardEvent) => e.key === 'Enter' && (go(address.value), address.blur()),
      onFocus: () => address.select(),
    })
    start = startPage()
    const keep = wv
    if (!keep) {
      wv = document.createElement('webview') as Electron.WebviewTag
      wv.setAttribute('partition', 'persist:croo-browser')
      wv.hidden = true
      wv.className = 'webview'
      wv.addEventListener('did-start-loading', () => ((loading = true), sync()))
      wv.addEventListener('did-stop-loading', () => ((loading = false), sync()))
      const nav = (e: Event) => {
        const url = (e as Event & { url?: string }).url
        if (url && document.activeElement !== address) address.value = current = url
        sync()
      }
      wv.addEventListener('did-navigate', nav)
      wv.addEventListener('did-navigate-in-page', nav)
    }
    root = h(
      'div',
      { class: 'side-col browser' },
      h(
        'div',
        { class: 'side-head browser-bar' },
        h('button', { class: 'icon-btn small nav-back no-drag', type: 'button', title: 'Back', disabled: true, onClick: () => wv?.goBack() }, icon('back', 16)),
        h('button', { class: 'icon-btn small nav-fwd no-drag', type: 'button', title: 'Forward', disabled: true, onClick: () => wv?.goForward() }, icon('chevron', 16)),
        h('button', { class: 'icon-btn small nav-reload no-drag', type: 'button', title: 'Reload', onClick: () => (loading ? wv?.stop() : current ? wv?.reload() : null) }, icon('refresh', 15)),
        address,
        h('button', { class: 'icon-btn small no-drag', type: 'button', title: 'Open in your browser', onClick: () => current && void croo.openExternal(current) }, icon('external', 15)),
        h('button', { class: 'icon-btn small no-drag', type: 'button', title: 'Close', onClick: closeSide }, icon('x', 15)),
      ),
      h('div', { class: 'progress' }),
      h('div', { class: 'browser-body' }, start, wv),
    )
    if (keep && current) {
      start.hidden = true
      wv!.hidden = false
      address.value = current
    }
    return root
  }

  return { view, focusAddress: () => !current && requestAnimationFrame(() => address?.focus()) }
})()
