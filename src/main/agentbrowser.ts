import { BrowserWindow, type WebContents } from 'electron'
import type { Tool } from '../tools/index.js'
import { isLocalUrl } from '../config.js'

/**
 * A browser the agent drives itself, so it can check its own work: open the dev server it started, read
 * the page, click and type, look at a screenshot and see console errors. It is a hidden window with its
 * own throwaway session, separate from the in-app browser and from the user's sign-ins.
 */
let win: BrowserWindow | null = null
const logs: string[] = []

function page(): WebContents {
  if (win && !win.isDestroyed()) return win.webContents
  win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    paintWhenInitiallyHidden: true,
    webPreferences: { partition: 'croo-agent', sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  })
  const wc = win.webContents
  wc.setWindowOpenHandler(({ url }) => (/^https?:/i.test(url) && void wc.loadURL(url), { action: 'deny' }))
  wc.on('console-message', (e: any) => {
    const level = e.level ?? 'info'
    // Electron's own developer warning about the page's CSP is noise to the agent.
    if (level === 'debug' || /^Electron Security Warning/.test(e.message ?? '')) return
    log(`[${level}] ${e.message}${e.lineNumber ? ` (${String(e.sourceId ?? '').split('/').pop()}:${e.lineNumber})` : ''}`)
  })
  wc.on('did-fail-load', (_e, code, desc, url, main) => main && log(`[load failed] ${url}: ${desc} (${code})`))
  wc.on('render-process-gone', (_e, d) => log(`[crashed] ${d.reason}`))
  win.on('closed', () => (win = null))
  return wc
}

function log(line: string) {
  logs.push(line.slice(0, 500))
  if (logs.length > 200) logs.splice(0, logs.length - 200)
}

export function closeAgentBrowser() {
  if (win && !win.isDestroyed()) win.destroy()
  win = null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function settle(wc: WebContents, ms = 15_000) {
  const t0 = Date.now()
  while (wc.isLoading() && Date.now() - t0 < ms) await sleep(100)
  await sleep(300) // let client-side rendering catch up
}

/** Run script in the page, retrying when a navigation swapped the frame out from under it. */
async function js<T = any>(wc: WebContents, code: string): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await wc.executeJavaScript(code, true)
    } catch (e: any) {
      if (i >= 3 || !/disposed|destroyed|navigat/i.test(String(e?.message ?? e))) throw e
      await sleep(250)
      await settle(wc)
    }
  }
}

/** Number the visible, interactive elements and describe them with the page's text. */
const READ = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const sel = 'a[href], button, input, select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=tab], [role=menuitem], [contenteditable=true], [onclick]'
  const out = []
  let n = 0
  document.querySelectorAll('[data-croo-ref]').forEach((el) => el.removeAttribute('data-croo-ref'))
  for (const el of document.querySelectorAll(sel)) {
    if (!vis(el) || n >= 150) continue
    const ref = ++n
    el.setAttribute('data-croo-ref', String(ref))
    const tag = el.tagName.toLowerCase()
    const role = el.getAttribute('role')
    const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || el.alt || '').trim().replace(/\\s+/g, ' ').slice(0, 80)
    const extra = [el.type && tag === 'input' ? 'type=' + el.type : '', el.placeholder ? 'placeholder="' + el.placeholder + '"' : '', (tag === 'input' || tag === 'textarea') && el.value ? 'value="' + String(el.value).slice(0, 60) + '"' : '', el.disabled ? 'disabled' : '', el.checked ? 'checked' : '', tag === 'a' ? 'href=' + el.getAttribute('href') : ''].filter(Boolean).join(' ')
    out.push('[' + ref + '] ' + (role || tag) + (label ? ' "' + label + '"' : '') + (extra ? ' ' + extra : ''))
  }
  const text = (document.body?.innerText || '').replace(/\\n{3,}/g, '\\n\\n').trim()
  return { title: document.title, url: location.href, text: text.slice(0, 8000), more: Math.max(0, text.length - 8000), elements: out, scroll: Math.round(scrollY), height: document.documentElement.scrollHeight }
})()`

async function read(wc: WebContents): Promise<string> {
  const r = await js(wc, READ)
  return [
    `${r.title || '(no title)'} · ${r.url}`,
    r.text ? `\nText:\n${r.text}${r.more ? `\n… ${r.more} more characters (scroll or use action "read" again after scrolling)` : ''}` : '\n(The page has no text.)',
    r.elements.length ? `\nInteractive elements (use the number as ref to click or type):\n${r.elements.join('\n')}` : '',
    recentErrors(),
  ]
    .filter(Boolean)
    .join('\n')
}

let shownLogs = 0
/** Console errors and warnings since the last time the agent saw them. */
function recentErrors(all = false): string {
  const fresh = logs.slice(shownLogs).filter((l) => all || /^\[(error|warning|load failed|crashed)/.test(l))
  shownLogs = logs.length
  return fresh.length ? `\nConsole:\n${fresh.slice(-30).join('\n')}` : ''
}

/** Where an element is on screen, after scrolling it into view. */
async function locate(wc: WebContents, a: any): Promise<{ x: number; y: number; desc: string }> {
  const find = a.ref !== undefined ? `document.querySelector('[data-croo-ref="${Number(a.ref)}"]')` : a.selector ? `document.querySelector(${JSON.stringify(String(a.selector))})` : null
  if (!find) throw new Error('Give a ref from action "read", or a CSS selector.')
  const r = await js(wc, `(() => { const el = ${find}; if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, desc: (el.tagName.toLowerCase() + ' ' + (el.getAttribute('aria-label') || el.innerText || el.placeholder || el.name || el.value || '').trim().slice(0, 60)).trim() } })()`)
  if (!r) throw new Error(a.ref !== undefined ? `No element [${a.ref}]. The page may have changed: use action "read" again.` : `Nothing matches ${a.selector}.`)
  return r
}

async function click(wc: WebContents, x: number, y: number) {
  const at = { x: Math.round(x), y: Math.round(y) }
  wc.sendInputEvent({ type: 'mouseMove', ...at })
  wc.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 })
}

async function screenshot(wc: WebContents) {
  const img = await wc.capturePage()
  const small = img.getSize().width > 1280 ? img.resize({ width: 1280 }) : img
  return small.toJPEG(70).toString('base64')
}

export const ACTIONS = ['navigate', 'read', 'screenshot', 'click', 'type', 'press', 'scroll', 'back', 'console', 'close'] as const

export const browserTool: Tool = {
  spec: {
    name: 'browser',
    description: `Drive a real browser (Chromium, 1280×800) to check your work in a web app, e.g. a dev server you started with bash run_in_background. Actions:
- navigate {url}: open a page; returns its text, numbered interactive elements and console errors
- read: the current page's text and numbered interactive elements again (after it changed)
- screenshot: a picture of the visible page, to check layout and styling
- click {ref | selector}: click an element (ref is the number from navigate/read)
- type {ref | selector, text, submit?}: replace the text in a field; submit presses Enter afterwards
- press {key}: press a key such as Enter, Escape, Tab or ArrowDown
- scroll {direction: up|down}: scroll by most of a screen
- back, console (every console message since the last call), close
Localhost pages open without asking; other sites ask the user first.`,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...ACTIONS], description: 'What to do' },
        url: { type: 'string', description: 'navigate: full URL, e.g. http://localhost:5173' },
        ref: { type: 'integer', description: 'click/type: element number from navigate or read' },
        selector: { type: 'string', description: 'click/type: CSS selector, when there is no ref' },
        text: { type: 'string', description: 'type: the text to enter' },
        submit: { type: 'boolean', description: 'type: press Enter afterwards' },
        key: { type: 'string', description: 'press: e.g. Enter, Escape, Tab, ArrowDown' },
        direction: { type: 'string', enum: ['up', 'down'] },
      },
      required: ['action'],
    },
  },
  summarize: (a) => `${a.action ?? ''}${a.url ? ' ' + a.url : a.ref !== undefined ? ` [${a.ref}]` : a.selector ? ' ' + a.selector : a.key ? ' ' + a.key : ''}${a.text ? ` "${String(a.text).slice(0, 40)}"` : ''}`,
  prepare(a) {
    if (a.action === 'navigate' && !/^https?:\/\//i.test(String(a.url ?? ''))) throw new Error('url must start with http:// or https://')
    return { kind: 'read', tool: 'browser', summary: a.action === 'navigate' ? String(a.url) : `${a.action}` }
  },
  async run(a) {
    const wc = page()
    switch (a.action) {
      case 'navigate': {
        const url = String(a.url ?? '')
        if (!/^https?:\/\//i.test(url)) throw new Error('url must start with http:// or https://')
        shownLogs = logs.length
        try {
          await wc.loadURL(url)
        } catch (e: any) {
          // A redirect or an aborted load still leaves a page; a refused connection does not.
          if (!wc.getURL() || wc.getURL() === 'about:blank') throw new Error(`Could not open ${url}: ${e?.message ?? e}${isLocalUrl(url) ? '. Is the dev server running? Check with bash_output.' : ''}`)
        }
        await settle(wc)
        // A refused or failed load leaves Chromium's error page; say so instead of describing it.
        const failed = logs.slice(shownLogs).find((l) => l.startsWith('[load failed]'))
        if (failed) {
          shownLogs = logs.length
          throw new Error(`Could not open ${url}: ${failed.replace(/^\[load failed\] \S+: /, '')}${isLocalUrl(url) ? '. Is the dev server running? Check with bash_output.' : ''}`)
        }
        return read(wc)
      }
      case 'read':
        return read(wc)
      case 'screenshot': {
        const data = await screenshot(wc)
        return { text: `Screenshot of ${wc.getURL() || 'a blank page'} (1280×800).${recentErrors()}`, images: [{ name: 'screenshot.jpg', mime: 'image/jpeg', data }] }
      }
      case 'click': {
        const el = await locate(wc, a)
        await click(wc, el.x, el.y)
        await sleep(200)
        await settle(wc)
        return `Clicked ${el.desc}. Now at ${wc.getURL()}.${recentErrors()}\nUse "read" or "screenshot" to see the result.`
      }
      case 'type': {
        const el = await locate(wc, a)
        await click(wc, el.x, el.y)
        await js(wc, `(() => { const el = document.activeElement; if (el && 'select' in el) el.select(); else document.execCommand('selectAll') })()`)
        await wc.insertText(String(a.text ?? ''))
        if (a.submit) {
          wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
          wc.sendInputEvent({ type: 'char', keyCode: '\r' })
          wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
          await sleep(200)
          await settle(wc)
        }
        return `Typed into ${el.desc}${a.submit ? ' and pressed Enter' : ''}.${recentErrors()}`
      }
      case 'press': {
        const key = String(a.key ?? 'Enter')
        wc.sendInputEvent({ type: 'keyDown', keyCode: key })
        if (key === 'Enter') wc.sendInputEvent({ type: 'char', keyCode: '\r' })
        wc.sendInputEvent({ type: 'keyUp', keyCode: key })
        await sleep(200)
        await settle(wc)
        return `Pressed ${key}.${recentErrors()}`
      }
      case 'scroll': {
        const y = await js(wc, `(window.scrollBy(0, ${a.direction === 'up' ? -1 : 1} * innerHeight * 0.8), Math.round(scrollY) + ' of ' + document.documentElement.scrollHeight)`)
        return `Scrolled ${a.direction === 'up' ? 'up' : 'down'}; now at ${y}px.`
      }
      case 'back':
        if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
        await settle(wc)
        return `Now at ${wc.getURL()}.`
      case 'console':
        return recentErrors(true).trim() || 'No console messages.'
      case 'close':
        closeAgentBrowser()
        return 'Closed the browser.'
      default:
        throw new Error(`Unknown action "${a.action}". Use one of: ${ACTIONS.join(', ')}.`)
    }
  },
}
