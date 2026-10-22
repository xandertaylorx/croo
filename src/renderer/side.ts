import type { FsEntry, FsFile, GitFile, GitStatus } from '../shared/ipc.js'
import { h, icon, tildify } from './dom.js'
import { Frog } from './frog.js'
import { parseDiff, statusLabel } from './gitdiff.js'
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
    if (at === cwd) gitPanel.apply(st)
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

// ---------- git ----------

const gitPanel = (() => {
  let status: GitStatus | null = null
  const picked = new Set<string>()
  const known = new Set<string>()
  const open = new Set<string>()
  const diffs = new Map<string, string>()
  let message = ''
  let busy: '' | 'commit' | 'push' | 'pull' = ''
  let note: { ok: boolean; text: string } | null = null
  let publishing = false
  let publishCard: HTMLElement
  let top: HTMLElement | null = null
  let list: HTMLElement | null = null
  let foot: HTMLElement | null = null
  let box: HTMLTextAreaElement | null = null
  let commitBtn: HTMLButtonElement
  let pushBtn: HTMLButtonElement
  let pullBtn: HTMLButtonElement
  let noteEl: HTMLElement

  const files = () => status?.files ?? []
  const chosen = () => files().filter((f) => picked.has(f.path)).map((f) => f.path)

  const setBadge = (n: number) => {
    store.gitCount = n
    for (const b of document.querySelectorAll<HTMLElement>('.btn-git')) b.dataset.count = String(n)
  }

  const apply = (s: GitStatus) => {
    status = s
    const present = new Set(s.files.map((f) => f.path))
    for (const p of [...picked]) if (!present.has(p)) picked.delete(p)
    for (const f of s.files) if (!known.has(f.path)) (known.add(f.path), picked.add(f.path)) // new changes start selected
    diffs.clear()
    setBadge(s.repo ? s.files.length : 0)
    paint()
  }

  const load = async () => {
    if (cwd) apply(await croo.gitStatus(cwd))
  }

  /** Connect or create a remote, then push. Used by the Publish card. */
  const publish = async (how: { remote: string } | { name: string; isPrivate: boolean }) => {
    if (!cwd || !status || busy) return
    busy = 'push'
    note = null
    paintFoot()
    const res = 'remote' in how ? await croo.gitConnect(cwd, how.remote) : await croo.gitPublish(cwd, how.name, how.isPrivate)
    busy = ''
    note = { ok: res.ok, text: res.hint ? (res.output ? `${res.hint}\n\n${res.output}` : res.hint) : res.output }
    if (res.ok) publishing = false
    await load()
  }

  const run = async (kind: 'commit' | 'push' | 'pull') => {
    if (!cwd || !status || busy) return
    busy = kind
    note = null
    paintFoot()
    const res =
      kind === 'commit'
        ? await croo.gitCommit(cwd, chosen(), message)
        : kind === 'push'
          ? await croo.gitPush(cwd, !!status.upstream)
          : await croo.gitPull(cwd)
    busy = ''
    note = { ok: res.ok, text: res.hint ? (res.output ? `${res.hint}\n\n${res.output}` : res.hint) : res.output }
    if (res.ok && kind === 'commit') {
      message = ''
      if (box) box.value = ''
      open.clear()
    }
    await load()
    refreshFiles()
  }

  const toggleOpen = async (f: GitFile) => {
    if (open.has(f.path)) open.delete(f.path)
    else {
      open.add(f.path)
      if (cwd && !diffs.has(f.path)) {
        paintList()
        diffs.set(f.path, await croo.gitDiff(cwd, f.path, f.index === '?'))
      }
    }
    paintList()
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

  const fileRow = (f: GitFile): HTMLElement => {
    const { letter, word } = statusLabel(f.index, f.work)
    const slash = f.path.lastIndexOf('/')
    const isOpen = open.has(f.path)
    const check = h('input', { class: 'check', type: 'checkbox', 'aria-label': `Include ${f.path}`, onClick: (e: Event) => e.stopPropagation() })
    check.checked = picked.has(f.path)
    check.addEventListener('change', () => ((check.checked ? picked.add(f.path) : picked.delete(f.path)), paintList(), paintFoot()))
    return h(
      'div',
      { class: `git-file ${isOpen ? 'open' : ''}` },
      h(
        'div',
        { class: 'git-row', role: 'button', tabindex: 0, onClick: () => void toggleOpen(f), onKeydown: (e: KeyboardEvent) => e.key === 'Enter' && e.target === e.currentTarget && void toggleOpen(f) },
        check,
        h('span', { class: `git-badge s-${letter}`, 'data-tip': word }, letter),
        h('span', { class: 'git-name', 'data-tip': f.orig ? `${f.orig} → ${f.path}` : f.path }, slash >= 0 ? h('small', null, f.path.slice(0, slash + 1)) : null, f.path.slice(slash + 1)),
        f.add !== undefined || f.del !== undefined ? h('span', { class: 'git-counts' }, h('b', { class: 'add' }, `+${f.add ?? 0}`), h('b', { class: 'del' }, `−${f.del ?? 0}`)) : null,
        icon('chevron', 11),
      ),
      isOpen ? diffView(f) : null,
    )
  }

  const paintTop = () => {
    if (!top) return
    if (!status?.repo) return top.replaceChildren()
    top.replaceChildren(
      h('span', { class: 'branch', 'data-tip': status.upstream ? `Tracking ${status.upstream}` : 'No upstream yet' }, icon('branch', 13), status.branch || 'HEAD'),
      status.ahead || status.behind
        ? h('span', { class: 'sync' }, status.ahead ? h('b', { 'data-tip': `${status.ahead} to push` }, `↑${status.ahead}`) : null, status.behind ? h('b', { 'data-tip': `${status.behind} to pull` }, `↓${status.behind}`) : null)
        : status.upstream
          ? h('span', { class: 'sync' }, 'up to date')
          : h('span', { class: 'sync' }, 'not published'),
    )
  }

  const paintList = () => {
    if (!list) return
    if (!status) return list.replaceChildren(h('div', { class: 'side-empty' }, 'Loading…'))
    if (!status.repo) {
      return list.replaceChildren(
        h(
          'div',
          { class: 'git-empty' },
          new Frog(84).el,
          h('p', null, 'This folder is not a git repository.'),
          h('button', { class: 'btn', type: 'button', onClick: async () => cwd && (await croo.gitInit(cwd), await load()) }, icon('branch', 14), 'Initialize repository'),
        ),
      )
    }
    if (!files().length) return list.replaceChildren(h('div', { class: 'git-empty' }, new Frog(84, 'happy').el, h('p', null, 'Nothing to commit. Working tree clean.')))
    const all = h('input', { class: 'check', type: 'checkbox', 'aria-label': 'Select all changes' })
    all.checked = chosen().length === files().length
    all.indeterminate = chosen().length > 0 && chosen().length < files().length
    all.addEventListener('change', () => {
      picked.clear()
      if (all.checked) for (const f of files()) picked.add(f.path)
      paintList()
      paintFoot()
    })
    list.replaceChildren(h('div', { class: 'git-all' }, all, h('span', null, `${files().length} changed file${files().length === 1 ? '' : 's'}`)), ...files().map(fileRow))
  }

  const paintPublish = (noRemote: boolean) => {
    publishCard.hidden = !(noRemote && publishing)
    if (publishCard.hidden || publishCard.dataset.built) return
    publishCard.dataset.built = '1'
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
      h('div', { class: 'git-publish-title' }, 'Connect this folder to a remote'),
      ...(status?.gh
        ? [
            h('div', { class: 'inline-row' }, name, vis),
            h('button', { class: 'btn primary', type: 'button', onClick: () => void publish({ name: name.value.trim(), isPrivate: priv }) }, icon('external', 14), 'Create on GitHub and push'),
            h('div', { class: 'git-or' }, 'or use an existing repository'),
          ]
        : [h('p', { class: 'muted' }, 'Create an empty repository on GitHub (or anywhere), then paste its address here. Install the GitHub CLI (gh) to create one from this panel.')]),
      h('div', { class: 'inline-row' }, url, h('button', { class: 'btn', type: 'button', onClick: go }, 'Connect & push')),
    )
  }

  const paintFoot = () => {
    if (!foot) return
    const n = chosen().length
    const repo = !!status?.repo
    foot.hidden = !repo
    commitBtn.disabled = !!busy || !message.trim() || n === 0
    commitBtn.replaceChildren(busy === 'commit' ? h('span', { class: 'spinner' }) : icon('check', 14), `Commit${n ? ` (${n})` : ''}`)
    const ahead = status?.ahead ?? 0
    pushBtn.disabled = !!busy || !!(status?.upstream && ahead === 0)
    pushBtn.replaceChildren(busy === 'push' ? h('span', { class: 'spinner' }) : icon('arrowUp', 14), 'Push', ...(ahead ? [h('small', null, `${ahead}`)] : []))
    const noRemote = !!status?.repo && !status.remotes.length
    if (noRemote) pushBtn.replaceChildren(busy === 'push' ? h('span', { class: 'spinner' }) : icon('external', 14), 'Publish…')
    pushBtn.disabled = !!busy
    pushBtn.dataset.tip = noRemote ? 'Connect this folder to GitHub' : status?.upstream ? `Push to ${status.upstream}` : 'Publish this branch to origin'
    paintPublish(noRemote)
    pullBtn.disabled = !!busy || !status?.upstream
    pullBtn.replaceChildren(busy === 'pull' ? h('span', { class: 'spinner' }) : icon('arrowDown', 14))
    noteEl.hidden = !note
    noteEl.className = `git-note ${note?.ok ? 'ok' : 'bad'}`
    noteEl.textContent = note?.text ?? ''
  }

  const paint = () => {
    if (!list?.isConnected) return
    paintTop()
    paintList()
    paintFoot()
  }

  const view = (): HTMLElement => {
    top = h('div', { class: 'git-top' })
    list = h('div', { class: 'git-list' })
    box = h('textarea', {
      class: 'git-msg',
      rows: 2,
      placeholder: 'Commit message',
      spellcheck: 'true',
      onInput: () => ((message = box!.value), paintFoot()),
      onKeydown: (e: KeyboardEvent) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && (e.preventDefault(), void run('commit')),
    })
    box.value = message
    commitBtn = h('button', { class: 'btn primary grow', type: 'button', title: 'Commit the selected files (⌘↵)', onClick: () => void run('commit') })
    pushBtn = h('button', { class: 'btn grow', type: 'button', onClick: () => (status && !status.remotes.length ? ((publishing = !publishing), paintFoot()) : void run('push')) })
    pullBtn = h('button', { class: 'btn icon', type: 'button', title: 'Pull (fast-forward only)', onClick: () => void run('pull') })
    noteEl = h('pre', { class: 'git-note', hidden: true })
    publishCard = h('div', { class: 'git-publish', hidden: true })
    foot = h('div', { class: 'git-foot' }, publishCard, box, h('div', { class: 'git-actions' }, commitBtn, pushBtn, pullBtn), noteEl)
    const el = h(
      'div',
      { class: 'side-col' },
      head('Git', h('button', { class: 'icon-btn small no-drag', type: 'button', title: 'Refresh', onClick: () => void load() }, icon('refresh', 15))),
      top,
      list,
      foot,
    )
    paint()
    void load()
    return el
  }

  return {
    view,
    apply,
    reset() {
      status = null
      picked.clear()
      known.clear()
      open.clear()
      diffs.clear()
      message = ''
      note = null
      publishing = false
      setBadge(0)
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
