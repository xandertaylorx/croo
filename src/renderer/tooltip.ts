/** One shared tooltip for everything with data-tip (and data-key for the shortcut, drawn as keycaps). */

const tip = document.createElement('div')
tip.className = 'tooltip'
tip.setAttribute('role', 'tooltip')
let target: HTMLElement | null = null
let timer = 0
let lastShown = 0

const KEYS = /⌘|⇧|⌥|⌃|↵|⇥|[A-Za-z0-9,.\[\]\\/;'`=-]+|\S/g

function show(el: HTMLElement) {
  const label = el.dataset.tip
  if (!label) return
  const key = el.dataset.key
  tip.replaceChildren(Object.assign(document.createElement('span'), { textContent: label }))
  if (key) for (const k of key.match(KEYS) ?? []) tip.append(Object.assign(document.createElement('kbd'), { textContent: k }))
  tip.classList.remove('show')
  document.body.append(tip)
  const r = el.getBoundingClientRect()
  const t = tip.getBoundingClientRect()
  const below = r.bottom + 8 + t.height < window.innerHeight
  tip.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8)}px`
  tip.style.top = `${below ? r.bottom + 8 : r.top - 8 - t.height}px`
  requestAnimationFrame(() => tip.classList.add('show'))
  lastShown = Date.now()
}

function hide() {
  clearTimeout(timer)
  target = null
  tip.classList.remove('show')
  tip.remove()
}

export function initTooltips() {
  document.addEventListener('mouseover', (e) => {
    const el = (e.target as HTMLElement).closest?.<HTMLElement>('[data-tip]') ?? null
    if (el === target) return
    hide()
    target = el
    if (!el) return
    // Slow to appear the first time, instant when moving between neighbours.
    timer = window.setTimeout(() => show(el), Date.now() - lastShown < 400 ? 0 : 450)
  })
  document.addEventListener('mouseleave', hide)
  for (const ev of ['mousedown', 'keydown', 'wheel', 'blur']) window.addEventListener(ev, hide, true)
}
