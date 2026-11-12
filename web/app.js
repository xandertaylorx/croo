// Home page: app mocks, reveals, release info, copy buttons and motion. Needs site.js first.

/* ---------------- giant wordmark ---------------- */
if (draw) {
  const giant = $('#giant-text')
  if (giant) {
    const still = draw(1400, 520, 'silk', 'mark', 12.0)
    const url = still.toDataURL('image/jpeg', 0.9)
    giant.style.backgroundImage = `repeating-linear-gradient(-28deg, rgba(255,255,255,.10) 0 1px, transparent 1px 4px), url(${url})`
    giant.style.backgroundSize = 'auto, 220% 100%'
    giant.style.backgroundPosition = '0 0, 0% 50%'
  }
}

/* ---------------- app mocks ----------------
   The app windows are the app's own pages, drawn at their real size and scaled to the column: sharp at any width. */
function fitApps() {
  document.querySelectorAll('.app[data-w]').forEach((app) => {
    const w = Number(app.dataset.w)
    const h = Number(app.dataset.h)
    const view = app.querySelector('.app-view')
    const frame = view.querySelector('iframe')
    const s = view.clientWidth / w
    frame.style.width = `${w}px`
    frame.style.height = `${h}px`
    frame.style.transform = `scale(${s})`
    view.style.height = `${Math.round(h * s)}px`
  })
}
fitApps()
new ResizeObserver(fitApps).observe(document.body)

/* ---------------- reveal on scroll ---------------- */
// Headlines rise line by line out of a mask: each <br>-separated line gets its own clipping box.
document.querySelectorAll('.display, .h2').forEach((h) => {
  const lines = [[]]
  for (const node of [...h.childNodes]) {
    if (node.nodeName === 'BR') lines.push([])
    else lines[lines.length - 1].push(node)
  }
  h.textContent = ''
  lines.forEach((nodes, i) => {
    const line = document.createElement('span')
    const inner = document.createElement('span')
    line.className = 'line'
    inner.className = 'line-in'
    inner.style.setProperty('--i', i)
    inner.append(...nodes)
    line.append(inner)
    h.append(line)
  })
  h.classList.add('split-lines')
})
// The hero headline plays on load; the rest wait to be scrolled to.
setTimeout(() => $('.hero .display')?.classList.add('in'), 60)

const clipped = '.stage, .hero-tile, .bento > .media, .split-art'
const revealables = document.querySelectorAll(
  `${clipped}, .split-lines:not(.hero .display), .stage .kicker, .stage .app, .bento > .card, .bento > .code, .split-main > :not(.display), .giant, .wm-foot, .installs`,
)
const rio = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      e.target.classList.add('in')
      rio.unobserve(e.target)
    }
  },
  { rootMargin: '0px 0px -8% 0px' },
)
revealables.forEach((el, i) => {
  el.classList.add('reveal')
  if (el.matches(clipped)) el.classList.add('clip')
  if (el.parentElement?.classList.contains('bento')) el.style.transitionDelay = `${(i % 4) * 70}ms`
  rio.observe(el)
})

// Fallback for the observer, which only reports on rendered frames (and a browser can skip those): anything on
// screen that hasn't appeared yet is shown. It also runs on a timer, so it doesn't depend on frames either.
function revealVisible() {
  const pending = document.querySelectorAll('.reveal:not(.in)')
  for (const el of pending) {
    const r = el.getBoundingClientRect()
    if (r.top < innerHeight && r.bottom > 0) el.classList.add('in')
  }
  return pending.length
}
const revealTimer = setInterval(() => revealVisible() || clearInterval(revealTimer), 700)

/* ---------------- GitHub: release and stars ---------------- */


function showRelease(rel) {
  const version = rel.tag_name.replace(/^v/, '')
  const dmgs = (rel.assets || []).filter((a) => /\.dmg$/i.test(a.name))
  const arm = dmgs.find((a) => /arm64/i.test(a.name)) || dmgs[0]
  document.querySelectorAll('.term .ver').forEach((el) => (el.textContent = `v${version}`))
  const giantVer = $('#giant-ver')
  if (giantVer) giantVer.textContent = version.split('.').slice(0, 2).join('.')
  $('#rel-notes').href = `/changelog#v${version}`
  const dl = $('#dl-arm')
  dl.href = arm ? arm.browser_download_url : rel.html_url
  if (arm) $('#dl-arm-size').textContent = fmtSize(arm.size)
  if (arm && /Mac/i.test(navigator.platform || navigator.userAgent)) $('#hero-dl').href = arm.browser_download_url
}
// Offline or rate limited: the buttons already point at the releases page.
cachedJSON('croo.release', `https://api.github.com/repos/${REPO}/releases/latest`).then(showRelease).catch(() => {})

cachedJSON('croo.repo', `https://api.github.com/repos/${REPO}`)
  .then((r) => r.stargazers_count >= 10 && ($('#stars').textContent = ` ★ ${short(r.stargazers_count)}`))
  .catch(() => {})

if (!/Mac/i.test(navigator.platform || navigator.userAgent)) {
  $('#platform-note').textContent = 'Croo is Mac-only for now (Apple Silicon). On Windows or Linux, build it from source.'
}

/* ---------------- copy buttons ---------------- */
document.querySelectorAll('[data-copy]').forEach((btn) => {
  const label = btn.querySelector('.lbl') || btn
  const original = label.textContent
  btn.addEventListener('click', async () => {
    const target = $(btn.dataset.copy)
    // The hero terminal splits "curl" from its arguments for colouring.
    const text = (target.id === 'cmd-install' ? 'curl ' : '') + (target.dataset.full || target.textContent)
    try {
      await navigator.clipboard.writeText(text)
      label.textContent = 'Copied'
    } catch {
      const range = document.createRange()
      range.selectNodeContents(target)
      getSelection().removeAllRanges()
      getSelection().addRange(range)
      label.textContent = 'Press ⌘C'
    }
    setTimeout(() => (label.textContent = original), 1800)
  })
})

/* ---------------- motion and small interactions ---------------- */

// The hero terminal types its command, then prints the output a line at a time.
const cmd = $('#cmd-install')
if (cmd && !reduceMotion) {
  const full = cmd.textContent
  const outs = document.querySelectorAll('.term .out')
  cmd.dataset.full = full
  cmd.textContent = ''
  cmd.classList.add('typing')
  outs.forEach((o) => o.classList.add('wait'))
  let i = 0
  const tick = () => {
    cmd.textContent = full.slice(0, ++i)
    if (i < full.length) return setTimeout(tick, 14 + Math.random() * 30)
    setTimeout(() => cmd.classList.remove('typing'), 500)
    outs.forEach((o, k) => setTimeout(() => o.classList.remove('wait'), 450 + k * 480))
  }
  setTimeout(tick, 1400)
}

// Permission modes: pick one to read what it does.
const modeDesc = $('.mode-desc')
document.querySelectorAll('.chips-lg button').forEach((btn, _, all) =>
  btn.addEventListener('click', () => {
    all.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)))
    modeDesc.textContent = btn.dataset.desc
  }),
)

// Cards light up under the pointer.
document.querySelectorAll('.card').forEach((card) =>
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect()
    card.style.setProperty('--mx', `${e.clientX - r.left}px`)
    card.style.setProperty('--my', `${e.clientY - r.top}px`)
  }),
)

// The floating bar appears once the hero's own nav has scrolled away, and marks the section in view.
const dock = $('.dock')
const dockLinks = [...dock.querySelectorAll('nav a')]
const sectionIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      dockLinks.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${e.target.id}`))
    }
  },
  { rootMargin: '-45% 0px -45% 0px' },
)
document.querySelectorAll('#tour, #models, #control, #chat, #download').forEach((s) => sectionIO.observe(s))

// Scroll-linked: the floating app windows drift against their panels, and the big one grows into place.
const floats = [...document.querySelectorAll('.app.float')]
const stageApp = $('.stage .app')
let ticking = false
function onScroll() {
  ticking = false
  const vh = innerHeight
  revealVisible()
  const show = scrollY > vh * 0.6
  dock.classList.toggle('on', show)
  dock.inert = !show
  if (reduceMotion || innerWidth <= 900) return
  for (const el of floats) {
    const r = el.parentElement.getBoundingClientRect()
    if (r.bottom < 0 || r.top > vh) continue
    const p = (r.top + r.height / 2 - vh / 2) / vh
    el.style.translate = `0 ${(p * -48).toFixed(1)}px`
  }
  if (stageApp) {
    const r = stageApp.getBoundingClientRect()
    if (r.top < vh && r.bottom > 0) {
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75)))
      stageApp.style.scale = (0.9 + 0.1 * p).toFixed(4)
    }
  }
}
addEventListener('scroll', () => ticking || ((ticking = true), requestAnimationFrame(onScroll)), { passive: true })
addEventListener('resize', onScroll)
onScroll()

// The floating app windows lean toward the pointer.
if (!reduceMotion && matchMedia('(hover: hover)').matches) {
  document.querySelectorAll('.split-art').forEach((art) => {
    const win = art.querySelector('.app.float')
    art.addEventListener('pointermove', (e) => {
      const r = art.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      win.style.transform = `perspective(1400px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 7).toFixed(2)}deg)`
    })
    art.addEventListener('pointerleave', () => (win.style.transform = ''))
  })
}
