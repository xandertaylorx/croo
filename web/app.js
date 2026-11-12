// Croo website: shader-painted panels, scaled app mocks, latest release info, copy buttons.
const REPO = 'xandertaylorx/croo'
const $ = (s) => document.querySelector(s)
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
document.documentElement.classList.add('js')

/* ---------------- shader panels ----------------
   One hidden WebGL canvas paints every panel in turn and copies the frame into each panel's 2D canvas,
   so the page holds a single GL context however many panels there are. Panels are soft, so they render
   at reduced resolution and only while on screen. */

// Every palette is built from the app's own tokens: frog green and the green accent, the Plan-mode blue,
// the warning amber, the syntax purple and teal, and the dark theme's charcoal.
const PALETTES = {
  frog: ['#0d3b22', '#2a9a58', '#6fd58a', '#d3f1c9'],
  moss: ['#0f2417', '#1f6b3f', '#4fcb70', '#c8f0c2'],
  lapis: ['#1b2a57', '#4a6fb5', '#8eaee8', '#e4ecfb'],
  amber: ['#6a3a10', '#c9772f', '#ddb057', '#f7ecd2'],
  plum: ['#281656', '#8250df', '#c4a0f5', '#f1e8ff'],
  pond: ['#083836', '#0b7a75', '#5cc9a4', '#d6f3e4'],
  ink: ['#141312', '#262523', '#1f6b3f', '#5ed67e'],
  mark: ['#2a9a58', '#0b7a75', '#4a6fb5', '#8250df'], // mid tones only: readable on white and on charcoal
}
const SEEDS = { frog: 1.3, moss: 4.1, lapis: 7.7, amber: 2.9, plum: 5.5, pond: 9.2, ink: 6.4, mark: 3.3 }

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`
const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uMode; uniform float uSeed;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= .5; } return v; }

vec3 ramp(float t){
  t = clamp(t, 0., 1.);
  vec3 c = mix(uC0, uC1, smoothstep(0.05, 0.27, t));
  c = mix(c, uC2, smoothstep(0.32, 0.72, t));
  return mix(c, uC3, smoothstep(0.66, 1.0, t));
}

// Slow diagonal bands bent by noise: the colour field both modes share.
float field(vec2 p, float t){
  vec2 q = vec2(fbm(p * 0.9 + vec2(uSeed, t * 0.03)), fbm(p * 0.9 + vec2(5.2 - t * 0.025, uSeed)));
  float d = dot(p, normalize(vec2(1.0, -0.8)));
  float v = 0.5 + 0.5 * sin(d * 2.2 + q.x * 3.4 + uSeed + t * 0.08);
  return mix(v, 0.5 + 0.5 * sin(d * 0.9 + q.y * 2.0 + uSeed * 0.7), 0.45);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 1.6;
  float t = uTime;
  vec3 col;

  if (uMode < 0.5) {
    // Fluted glass: vertical ribs, wide on the left and tighter to the right, each refracting the field.
    float ribs = 9.0 + 9.0 * aspect;
    float w = pow(uv.x, 1.45) * ribs;
    float r = fract(w);
    vec2 sp = p * 1.5 + vec2((r - 0.5) * -0.32, (r - 0.5) * 0.22 + floor(w) * 0.035);
    float v = field(sp, t);
    v = clamp((v - 0.56) * 2.0 + 0.48, 0.0, 1.0);
    v = mix(v, 0.35 + uv.x * 0.55, 0.22);
    col = ramp(v);
    float edge = smoothstep(0.0, 0.06, r) * (1.0 - 0.25 * smoothstep(0.75, 1.0, r));
    float sheen = smoothstep(0.55, 0.85, r) * (1.0 - smoothstep(0.85, 1.0, r));
    col *= 0.86 + 0.14 * edge;
    col += 0.07 * sheen;
  } else {
    // Brushed silk: the field plus streaks stretched along the flow and a few soft light ribbons.
    float v = field(p, t);
    vec2 dir = normalize(vec2(1.0, 0.42));
    vec2 rp = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
    float streak = noise(rp * vec2(2.5, 160.0) + vec2(t * 0.05, uSeed)) - 0.5;
    streak += 0.5 * (noise(rp * vec2(1.2, 420.0) + uSeed) - 0.5);
    float ribbon = pow(1.0 - abs(sin(rp.y * 2.2 + fbm(rp * 0.8 + uSeed + t * 0.02) * 1.6)), 5.0);
    v += streak * 0.06 + ribbon * 0.12;
    v = clamp((v - 0.5) * 1.35 + 0.5, 0.0, 1.0);
    v = mix(v, uv.y * 0.5 + (1.0 - uv.x) * 0.15 + 0.25, 0.2);
    col = ramp(v);
    col += ribbon * 0.05;
  }

  col += (hash(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) * 0.035; // film grain
  gl_FragColor = vec4(col, 1.0);
}`

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)

function makeRenderer() {
  const glc = document.createElement('canvas')
  const gl = glc.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false })
  if (!gl) return null
  const sh = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }
  const prog = gl.createProgram()
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const u = Object.fromEntries(['uRes', 'uTime', 'uMode', 'uSeed', 'uC0', 'uC1', 'uC2', 'uC3'].map((n) => [n, gl.getUniformLocation(prog, n)]))

  return function draw(w, h, mode, palette, time) {
    if (glc.width !== w || glc.height !== h) {
      glc.width = w
      glc.height = h
    }
    gl.viewport(0, 0, w, h)
    const pal = PALETTES[palette] || PALETTES.frog
    gl.uniform2f(u.uRes, w, h)
    gl.uniform1f(u.uTime, time)
    gl.uniform1f(u.uMode, mode === 'fluted' ? 0 : 1)
    gl.uniform1f(u.uSeed, SEEDS[palette] || 0)
    pal.forEach((c, i) => gl.uniform3fv(u[`uC${i}`], hex(c)))
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    return glc
  }
}

let draw = null
try {
  draw = makeRenderer()
} catch (e) {
  console.warn('Shader panels off:', e)
}

if (draw) {
  const panels = [...document.querySelectorAll('canvas.shader')].map((el) => ({
    el,
    ctx: el.getContext('2d'),
    mode: el.dataset.mode,
    palette: el.dataset.palette,
    visible: false,
  }))
  const SCALE = 0.5 // soft imagery: half resolution is indistinguishable and four times cheaper

  const paint = (pn, time) => {
    const r = pn.el.getBoundingClientRect()
    const w = Math.max(2, Math.round(r.width * SCALE * Math.min(devicePixelRatio, 2)))
    const h = Math.max(2, Math.round(r.height * SCALE * Math.min(devicePixelRatio, 2)))
    if (pn.el.width !== w || pn.el.height !== h) {
      pn.el.width = w
      pn.el.height = h
    }
    pn.ctx.drawImage(draw(w, h, pn.mode, pn.palette, time), 0, 0)
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const pn = panels.find((x) => x.el === e.target)
      pn.visible = e.isIntersecting
      if (pn.visible) paint(pn, performance.now() / 1000)
    }
  })
  panels.forEach((pn) => io.observe(pn.el))
  panels.forEach((pn) => paint(pn, 0))

  if (!reduceMotion) {
    let last = 0
    const loop = (now) => {
      requestAnimationFrame(loop)
      if (now - last < 1000 / 30 || document.hidden) return
      last = now
      for (const pn of panels) if (pn.visible) paint(pn, now / 1000)
    }
    requestAnimationFrame(loop)
  }
  addEventListener('resize', () => panels.forEach((pn) => pn.visible && paint(pn, performance.now() / 1000)))

  // The giant wordmark is filled with one still frame of the silk shader.
  const giant = $('#giant-text')
  if (giant) {
    const still = draw(1400, 520, 'silk', 'mark', 12.0)
    const url = still.toDataURL('image/jpeg', 0.9)
    giant.style.backgroundImage = `repeating-linear-gradient(-28deg, rgba(255,255,255,.10) 0 1px, transparent 1px 4px), url(${url})`
    giant.style.backgroundSize = 'auto, cover'
    giant.style.backgroundPosition = 'center'
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
const revealables = document.querySelectorAll('.stage-head, .stage .app, .bento > .tile, .split-art, .split-main, .giant, .wm-foot')
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
  if (el.parentElement?.classList.contains('bento')) el.style.transitionDelay = `${(i % 4) * 70}ms`
  rio.observe(el)
})

/* ---------------- GitHub: release and stars ---------------- */
const fmtSize = (b) => (b ? `${Math.round(b / 1048576)} MB` : '')

async function cachedJSON(key, url) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || 'null')
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data
  } catch {}
  const res = await fetch(url, { headers: { accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(String(res.status))
  const data = await res.json()
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }))
  } catch {}
  return data
}

function showRelease(rel) {
  const version = rel.tag_name.replace(/^v/, '')
  const dmgs = (rel.assets || []).filter((a) => /\.dmg$/i.test(a.name))
  const arm = dmgs.find((a) => /arm64/i.test(a.name)) || dmgs[0]
  document.querySelectorAll('.term .ver').forEach((el) => (el.textContent = `v${version}`))
  const giantVer = $('#giant-ver')
  if (giantVer) giantVer.textContent = version.split('.').slice(0, 2).join('.')
  $('#rel-notes').href = rel.html_url
  const dl = $('#dl-arm')
  dl.href = arm ? arm.browser_download_url : rel.html_url
  if (arm) $('#dl-arm-size').textContent = fmtSize(arm.size)
  if (arm && /Mac/i.test(navigator.platform || navigator.userAgent)) $('#hero-dl').href = arm.browser_download_url
}
// Offline or rate limited: the buttons already point at the releases page.
cachedJSON('croo.release', `https://api.github.com/repos/${REPO}/releases/latest`).then(showRelease).catch(() => {})

const short = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
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
    const text = (target.id === 'cmd-install' ? 'curl ' : '') + target.textContent
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

/* ---------------- theme ----------------
   Light unless the visitor picks dark; the choice is remembered. The system setting is deliberately ignored.
   The app mocks are the app's own CSS, which follows the system, so their dark media rules are re-pointed
   at the site's theme instead. */
const mockRules = new WeakMap()
function themeMock(frame, theme) {
  let doc
  try {
    doc = frame.contentDocument
  } catch {
    return
  }
  if (!doc || !doc.styleSheets.length) return
  for (const sheet of doc.styleSheets) {
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of rules) {
      if (!rule.media) continue
      if (!mockRules.has(rule)) mockRules.set(rule, rule.media.mediaText)
      const orig = mockRules.get(rule)
      if (!/prefers-color-scheme/.test(orig)) continue
      const wantsDark = /dark/.test(orig)
      rule.media.mediaText = wantsDark === (theme === 'dark') ? 'all' : 'not all'
    }
  }
  doc.documentElement.style.colorScheme = theme
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#171615' : '#f5f5f3'
  document.querySelectorAll('.theme-toggle').forEach((b) => {
    b.setAttribute('aria-pressed', String(theme === 'dark'))
    b.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')
  })
  document.querySelectorAll('.app iframe').forEach((f) => themeMock(f, theme))
}
const currentTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
document.querySelectorAll('.app iframe').forEach((f) => f.addEventListener('load', () => themeMock(f, currentTheme())))
document.querySelectorAll('.theme-toggle').forEach((b) =>
  b.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    try {
      localStorage.setItem('croo.theme', next)
    } catch {}
  }),
)
applyTheme(currentTheme())
