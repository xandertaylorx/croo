import type { FsEntry, FsFile } from '../shared/ipc.js'
import { h, icon, tildify } from './dom.js'
import { Frog } from './frog.js'
import { highlight } from './highlight.js'
import { bus, croo, remember, store } from './store.js'

type Tab = 'files' | 'browser'

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
  // Make room: on a narrow window the sidebar steps aside.
  if (window.innerWidth - (a.classList.contains('sidebar-hidden') ? 0 : 256) - panel.getBoundingClientRect().width < 420) a.classList.add('sidebar-hidden')
  render()
}

export function closeSide() {
  tab = null
  panel.hidden = true
  const a = app()
  a.classList.remove('side-open', 'side-files', 'side-browser')
}

/** The code chat in front changed: the file tree follows its folder. */
export function setFolder(next: string | undefined) {
  if (next === cwd) return
  cwd = next
  tree.reset()
  if (!next) return closeSide()
  if (tab === 'files') render()
}

export function refreshFiles() {
  if (tab === 'files' && !tree.viewing) void tree.reload()
}

function render() {
  const body = panel.querySelector<HTMLElement>('.side-body')!
  if (tab === 'files') body.replaceChildren(tree.view())
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
      const text = f.text ?? ''
      const lines = text.split('\n').length
      body = h(
        'div',
        { class: 'viewer' },
        h('pre', { class: 'gutter', 'aria-hidden': 'true' }, Array.from({ length: lines }, (_, i) => i + 1).join('\n')),
        h('pre', { class: 'code-pre' }, h('code', { class: 'hljs', html: highlight(text, ext) })),
      )
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
