// Shared by every page: shader panels, the light/dark theme, and cached GitHub requests.
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
uniform vec2 uRes; uniform float uTime; uniform float uMode; uniform float uSeed; uniform vec3 uMouse;
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
  // The pointer bends the field like a lens and lifts the light a little under it.
  vec2 ua = vec2(uv.x * aspect, uv.y), ma = vec2(uMouse.x * aspect, uMouse.y);
  float glow = uMouse.z * exp(-dot(ua - ma, ua - ma) * 6.0);
  p += (ua - ma) * glow * 0.9;

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

  col += glow * 0.07;
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
  const u = Object.fromEntries(['uRes', 'uTime', 'uMode', 'uSeed', 'uMouse', 'uC0', 'uC1', 'uC2', 'uC3'].map((n) => [n, gl.getUniformLocation(prog, n)]))

  return function draw(w, h, mode, palette, time, mouse) {
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
    gl.uniform3fv(u.uMouse, mouse || [0.5, 0.5, 0])
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
    mouse: [0.5, 0.5, 0], // x, y, strength: eased toward `aim` each frame
    aim: [0.5, 0.5, 0],
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
    for (let i = 0; i < 3; i++) pn.mouse[i] += (pn.aim[i] - pn.mouse[i]) * 0.12
    pn.ctx.drawImage(draw(w, h, pn.mode, pn.palette, time, pn.mouse), 0, 0)
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

  if (!reduceMotion && matchMedia('(hover: hover)').matches) {
    for (const pn of panels) {
      const host = pn.el.parentElement
      host.addEventListener('pointermove', (e) => {
        const r = pn.el.getBoundingClientRect()
        pn.aim = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height, 1]
      })
      host.addEventListener('pointerleave', () => (pn.aim[2] = 0))
    }
  }

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
}


/* ---------------- GitHub ---------------- */
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
  b.addEventListener('click', (e) => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark'
    // Where supported, the new theme spreads out from the button as a circle.
    if (document.startViewTransition && !reduceMotion) {
      const r = b.getBoundingClientRect()
      const root = document.documentElement.style
      root.setProperty('--vx', `${e.clientX || r.left + r.width / 2}px`)
      root.setProperty('--vy', `${e.clientY || r.top + r.height / 2}px`)
      document.startViewTransition(() => applyTheme(next))
    } else applyTheme(next)
    try {
      localStorage.setItem('croo.theme', next)
    } catch {}
  }),
)
applyTheme(currentTheme())

/* ---------------- changelog ----------------
   CHANGELOG.md is read from GitHub's raw CDN (no API rate limit) and turned into versions. The renderer only
   knows what the file uses: paragraphs, "- " lists, **bold**, `code` and [links](https://…). Text is escaped
   before any markup is added, so nothing in the file can inject HTML. */
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function inline(text) {
  const codes = []
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`)
  s = s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`)
}

function renderBlocks(md) {
  const out = []
  let list = null
  let para = []
  const flushPara = () => para.length && (out.push(`<p>${inline(para.join(' '))}</p>`), (para = []))
  const flushList = () => list && (out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`), (list = null))
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd()
    const item = line.match(/^\s*[-*] (.*)$/)
    if (item) {
      flushPara()
      ;(list ||= []).push(item[1])
    } else if (!line.trim()) {
      flushPara()
      flushList()
    } else if (list && /^\s{2,}\S/.test(line)) list[list.length - 1] += ' ' + line.trim()
    else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return out.join('')
}

async function loadChangelog() {
  const key = 'croo.changelog'
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || 'null')
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data
  } catch {}
  const res = await fetch(`https://raw.githubusercontent.com/${REPO}/main/CHANGELOG.md`)
  if (!res.ok) throw new Error(String(res.status))
  const text = await res.text()
  const data = text
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const nl = chunk.indexOf('\n')
      const version = chunk.slice(0, nl).trim().replace(/^v/, '')
      const body = chunk.slice(nl + 1).trim()
      const titles = [...body.matchAll(/^\s*[-*] \*\*(.+?)\*\*/gm)].map((m) => m[1].replace(/[:.]$/, ''))
      return { version, body, titles }
    })
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }))
  } catch {}
  return data
}

const fmtDate = (iso, opts = { year: 'numeric', month: 'short', day: 'numeric' }) => new Date(iso).toLocaleDateString('en-GB', opts)
const ago = (iso) => {
  const d = Math.round((Date.now() - new Date(iso)) / 86400000)
  if (d < 1) return 'today'
  if (d < 2) return 'yesterday'
  if (d < 30) return `${d} days ago`
  const m = Math.round(d / 30.4)
  return m < 12 ? `${m} month${m > 1 ? 's' : ''} ago` : `${Math.round(m / 12)} year${m >= 18 ? 's' : ''} ago`
}

async function loadReleases() {
  return cachedJSON('croo.releases', `https://api.github.com/repos/${REPO}/releases?per_page=100`)
}
const assetsOf = (rel) => {
  const files = (rel.assets || []).filter((a) => !/blockmap|\.yml$/i.test(a.name))
  return {
    dmg: files.find((a) => /arm64.*\.dmg$/i.test(a.name)) || files.find((a) => /\.dmg$/i.test(a.name)),
    zip: files.find((a) => /\.zip$/i.test(a.name)),
    downloads: files.reduce((n, a) => n + (a.download_count || 0), 0),
  }
}
const short = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
