/** Charts drawn from a small JSON spec the model writes in a ```chart block: bar, line, area, pie and donut, as inline SVG. */

interface Series {
  name: string
  values: number[]
}
interface Spec {
  type: 'bar' | 'line' | 'area' | 'pie' | 'donut'
  title: string
  unit: string
  labels: string[]
  series: Series[]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const TYPES = ['bar', 'line', 'area', 'pie', 'donut']
const W = 560
const H = 290

/** Read the model's JSON into a chart spec, or null when it is not a usable chart. */
export function parseChart(src: string): Spec | null {
  let j: any
  try {
    j = JSON.parse(src)
  } catch {
    return null
  }
  if (!j || typeof j !== 'object') return null
  const type = TYPES.includes(String(j.type).toLowerCase()) ? (String(j.type).toLowerCase() as Spec['type']) : 'bar'
  let labels: string[] = []
  let series: Series[] = []
  if (Array.isArray(j.data)) {
    labels = j.data.map((d: any) => String(d?.label ?? d?.name ?? ''))
    series = [{ name: String(j.name ?? j.title ?? ''), values: j.data.map((d: any) => Number(d?.value)) }]
  } else if (Array.isArray(j.labels) && Array.isArray(j.series)) {
    labels = j.labels.map(String)
    series = j.series.map((s: any) => ({ name: String(s?.name ?? ''), values: (Array.isArray(s?.values) ? s.values : []).map(Number) }))
  } else if (Array.isArray(j.labels) && Array.isArray(j.values)) {
    labels = j.labels.map(String)
    series = [{ name: String(j.name ?? ''), values: j.values.map(Number) }]
  }
  labels = labels.slice(0, 60)
  series = series.slice(0, 6).map((s) => ({ name: s.name, values: labels.map((_, i) => (Number.isFinite(s.values[i]) ? s.values[i] : 0)) }))
  if (!labels.length || !series.length) return null
  return { type, title: String(j.title ?? ''), unit: String(j.unit ?? ''), labels, series }
}

/** A round upper bound and step for the axis. */
function niceScale(min: number, max: number, ticks = 5): { lo: number; hi: number; step: number } {
  if (max === min) max = min + 1
  const raw = (max - min) / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step }
}

function short(n: number): string {
  const a = Math.abs(n)
  const f = (v: number, s: string) => `${Number(v.toFixed(v < 10 ? 1 : 0))}${s}`
  return a >= 1e9 ? f(n / 1e9, 'B') : a >= 1e6 ? f(n / 1e6, 'M') : a >= 1e4 ? f(n / 1e3, 'k') : String(Number(n.toFixed(2)))
}
const full = (n: number, unit: string) => `${Number(n.toFixed(2)).toLocaleString('en-US')}${unit ? (/^[%°]/.test(unit) ? '' : ' ') + unit : ''}`
const color = (i: number) => `var(--chart-${(i % 6) + 1})`
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function legend(items: string[], y: number): string {
  let x = 0
  const parts = items.map((name, i) => {
    const w = 22 + Math.min(name.length, 22) * 6.2
    const g = `<g transform="translate(${x},0)"><rect width="9" height="9" y="-8" rx="2" fill="${color(i)}"/><text x="14" class="ch-label">${esc(clip(name, 22))}</text></g>`
    x += w
    return g
  })
  return `<g transform="translate(${Math.max(8, (W - x) / 2)},${y})">${parts.join('')}</g>`
}

function cartesian(s: Spec): string {
  const all = s.series.flatMap((x) => x.values)
  // Bars and areas start at zero; a line may zoom in on its own range.
  const zero = s.type === 'bar' || s.type === 'area'
  const { lo, hi, step } = niceScale(zero ? Math.min(0, ...all) : Math.min(...all), zero ? Math.max(0, ...all) : Math.max(...all))
  const multi = s.series.length > 1
  const top = (s.title ? 40 : 14) + (multi ? 22 : 0)
  const left = 46
  const right = W - 14
  const bottom = H - 34
  const y = (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top)
  const n = s.labels.length
  const slot = (right - left) / n
  const grid: string[] = []
  for (let v = lo; v <= hi + step / 2; v += step) grid.push(`<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" class="${Math.abs(v) < 1e-9 ? 'ch-axis' : 'ch-grid'}"/><text x="${left - 7}" y="${y(v) + 3.5}" text-anchor="end" class="ch-label">${short(v)}</text>`)
  const every = Math.ceil(n / Math.max(1, Math.floor((right - left) / 54)))
  const xl = s.labels.map((l, i) => (i % every ? '' : `<text x="${left + slot * (i + 0.5)}" y="${bottom + 16}" text-anchor="middle" class="ch-label">${esc(clip(l, Math.max(4, Math.floor((slot * every) / 6.4))))}</text>`)).join('')
  let marks = ''
  if (s.type === 'bar') {
    const bw = Math.min(46, (slot * 0.72) / s.series.length)
    s.series.forEach((ser, si) =>
      ser.values.forEach((v, i) => {
        const x = left + slot * i + (slot - bw * s.series.length) / 2 + bw * si
        const y0 = y(Math.max(v, 0))
        const h = Math.max(1, Math.abs(y(v) - y(0)))
        marks += `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${(bw - 1.5).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color(si)}"><title>${esc(s.labels[i])}${multi ? ` · ${esc(ser.name)}` : ''}: ${esc(full(v, s.unit))}</title></rect>`
        if (n <= 8 && !multi) marks += `<text x="${(x + bw / 2).toFixed(1)}" y="${(v >= 0 ? y0 - 5 : y0 + h + 12).toFixed(1)}" text-anchor="middle" class="ch-value">${short(v)}</text>`
      }),
    )
  } else {
    s.series.forEach((ser, si) => {
      const pts = ser.values.map((v, i) => [left + slot * (i + 0.5), y(v)] as const)
      const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
      if (s.type === 'area') marks += `<path d="${d}L${pts[pts.length - 1][0].toFixed(1)},${y(0)}L${pts[0][0].toFixed(1)},${y(0)}Z" fill="${color(si)}" opacity="0.16"/>`
      marks += `<path d="${d}" fill="none" stroke="${color(si)}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`
      if (n <= 30) pts.forEach(([px, py], i) => (marks += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.4" fill="var(--bg)" stroke="${color(si)}" stroke-width="2"><title>${esc(s.labels[i])}${multi ? ` · ${esc(ser.name)}` : ''}: ${esc(full(ser.values[i], s.unit))}</title></circle>`))
    })
  }
  return grid.join('') + xl + marks + (multi ? legend(s.series.map((x) => x.name), s.title ? 52 : 18) : '')
}

function pie(s: Spec): string {
  const vals = s.series[0].values.map((v) => Math.max(0, v))
  const total = vals.reduce((a, b) => a + b, 0) || 1
  const cx = 150
  const cy = (s.title ? 40 : 0) + (H - (s.title ? 40 : 0)) / 2
  const r = Math.min(104, (H - (s.title ? 52 : 20)) / 2)
  const inner = s.type === 'donut' ? r * 0.58 : 0
  let a0 = -Math.PI / 2
  let out = ''
  vals.forEach((v, i) => {
    const frac = v / total
    if (frac <= 0) return
    const a1 = a0 + frac * Math.PI * 2 - (frac < 1 ? 0.012 : 0)
    const pt = (rad: number, ang: number) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`
    const large = a1 - a0 > Math.PI ? 1 : 0
    const d = frac >= 0.9999
      ? `M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0${inner ? `M${cx - inner},${cy}a${inner},${inner} 0 1,1 ${inner * 2},0a${inner},${inner} 0 1,1 ${-inner * 2},0` : ''}Z`
      : inner
        ? `M${pt(r, a0)}A${r},${r} 0 ${large} 1 ${pt(r, a1)}L${pt(inner, a1)}A${inner},${inner} 0 ${large} 0 ${pt(inner, a0)}Z`
        : `M${cx},${cy}L${pt(r, a0)}A${r},${r} 0 ${large} 1 ${pt(r, a1)}Z`
    out += `<path d="${d}" fill="${color(i)}" fill-rule="evenodd" stroke="var(--bg)" stroke-width="1.5"><title>${esc(s.labels[i])}: ${esc(full(v, s.unit))} (${(frac * 100).toFixed(1)}%)</title></path>`
    a0 += frac * Math.PI * 2
  })
  const rows = s.labels.slice(0, 12).map((l, i) => `<g transform="translate(300,${(s.title ? 62 : 30) + i * 20})"><rect width="10" height="10" y="-9" rx="2" fill="${color(i)}"/><text x="17" class="ch-label ch-strong">${esc(clip(l, 22))}</text><text x="256" text-anchor="end" class="ch-label">${((vals[i] / total) * 100).toFixed(vals[i] / total < 0.1 ? 1 : 0)}%</text></g>`).join('')
  return out + rows
}

/** The chart as inline SVG, or null when the spec cannot be read. */
export function renderChart(src: string): string | null {
  const s = parseChart(src)
  if (!s) return null
  const body = s.type === 'pie' || s.type === 'donut' ? pie(s) : cartesian(s)
  const title = s.title ? `<text x="${W / 2}" y="22" text-anchor="middle" class="ch-title">${esc(s.title)}</text>` : ''
  const unit = s.unit && s.type !== 'pie' && s.type !== 'donut' ? `<text x="4" y="${s.title ? 38 : 12}" class="ch-label">${esc(s.unit)}</text>` : ''
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.title || `${s.type} chart`)}">${title}${unit}${body}</svg></figure>`
}
