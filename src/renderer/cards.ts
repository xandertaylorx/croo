import type { Card } from '../shared/ipc.js'
import { h } from './dom.js'
import { croo } from './store.js'
import { describeWeather } from '../chat/weather.js'
import { fitView, project, tilesFor } from '../chat/maps.js'

/** The visual a chat tool returns: a calculation, a conversion, a clock, the weather or a map. */
export function renderCard(card: Card): HTMLElement {
  switch (card.type) {
    case 'calc':
      return h('div', { class: 'card calc' }, h('div', { class: 'calc-expr' }, card.expression.replace(/\*/g, '×').replace(/\//g, '÷').replace(/(?<=\s)-(?=\s)/g, '−')), h('div', { class: 'calc-result' }, h('span', null, '='), card.result))
    case 'convert':
      return h('div', { class: 'card convert' }, h('div', { class: 'convert-row' }, h('span', { class: 'convert-from' }, card.from), h('span', { class: 'convert-eq' }, '='), h('span', { class: 'convert-to' }, card.to)), card.note ? h('div', { class: 'card-note' }, card.note) : null)
    case 'clock':
      return h('div', { class: 'card clock' }, h('div', { class: 'clock-place' }, card.place), h('div', { class: 'clock-time' }, card.time), h('div', { class: 'clock-date' }, card.date), h('div', { class: 'card-note' }, [card.note, card.zone].filter(Boolean).join(' · ')))
    case 'weather':
      return weatherCard(card)
    case 'map':
      return mapCard(card)
  }
}

// ---------- weather ----------

type Weather = Extract<Card, { type: 'weather' }>

function sky(code: number, day: boolean): string {
  if (code >= 95) return 'storm'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 51) return 'rain'
  if (code === 45 || code === 48 || code === 3) return 'grey'
  return day ? (code <= 1 ? 'sun' : 'part') : 'night'
}

function weatherCard(c: Weather): HTMLElement {
  const u = c.units.temp
  const now = describeWeather(c.now.code, c.now.day)
  const dayName = (d: string, i: number) => (i === 0 ? 'Today' : new Date(`${d}T12:00`).toLocaleDateString([], { weekday: 'short' }))
  const lo = Math.min(...c.daily.map((d) => d.min))
  const hi = Math.max(...c.daily.map((d) => d.max))
  return h(
    'div',
    { class: `card wx sky-${sky(c.now.code, c.now.day)}` },
    h('div', { class: 'wx-top' }, h('div', null, h('div', { class: 'wx-place' }, c.place), h('div', { class: 'wx-temp' }, `${Math.round(c.now.temp)}${u}`), h('div', { class: 'wx-label' }, now.label)), h('div', { class: 'wx-emoji', 'aria-hidden': 'true' }, now.emoji)),
    h('div', { class: 'wx-facts' }, h('span', null, `Feels ${Math.round(c.now.feels)}${u}`), h('span', null, `Humidity ${c.now.humidity}%`), h('span', null, `Wind ${Math.round(c.now.wind)} ${c.units.wind}`)),
    c.hourly.length ? h('div', { class: 'wx-hours' }, c.hourly.map((p, i) => h('div', { class: 'wx-hour' }, h('span', null, i === 0 ? 'Now' : p.time), h('b', { 'aria-hidden': 'true' }, describeWeather(p.code, Number(p.time.slice(0, 2)) >= 6 && Number(p.time.slice(0, 2)) < 20).emoji), h('span', null, `${Math.round(p.temp)}°`)))) : null,
    h(
      'div',
      { class: 'wx-days' },
      c.daily.map((d, i) =>
        h(
          'div',
          { class: 'wx-day' },
          h('span', { class: 'wx-dn' }, dayName(d.date, i)),
          h('b', { 'aria-hidden': 'true', title: describeWeather(d.code).label }, describeWeather(d.code).emoji),
          h('span', { class: 'wx-rain' }, d.rain >= 20 ? `${d.rain}%` : ''),
          h('span', { class: 'wx-lo' }, `${Math.round(d.min)}°`),
          h('span', { class: 'wx-bar' }, h('i', { style: `left:${((d.min - lo) / (hi - lo || 1)) * 100}%;right:${100 - ((d.max - lo) / (hi - lo || 1)) * 100}%` })),
          h('span', { class: 'wx-hi' }, `${Math.round(d.max)}°`),
        ),
      ),
    ),
  )
}

// ---------- maps ----------

type MapCard = Extract<Card, { type: 'map' }>
const MW = 640
const MH = 280

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function mapCard(c: MapCard): HTMLElement {
  const lone = c.points.length === 1 && !(c.route && c.route.length > 1)
  const view = fitView([...c.points, ...(c.route ?? [])], MW, MH, 46, lone ? (c.points[0]?.kind === 'plane' ? 8 : 14) : 13)
  const x0 = view.cx - MW / 2
  const y0 = view.cy - MH / 2
  const at = (p: { lat: number; lon: number }) => {
    const w = project(p.lat, p.lon, view.z)
    return [w.x - x0, w.y - y0] as const
  }

  const tiles = h('div', { class: 'map-tiles' })
  for (const t of tilesFor(view, MW, MH)) {
    const img = h('img', { class: 'map-tile', alt: '', draggable: 'false', style: `left:${t.left}px;top:${t.top}px` })
    tiles.append(img)
    void croo.tile(t.z, t.x, t.y).then((src) => {
      if (!src) return
      img.src = src
      img.classList.add('in')
    })
  }

  let svg = ''
  if (c.route && c.route.length > 1) {
    const d = c.route.map((p) => at(p).map((n) => n.toFixed(1)).join(',')).join(' ')
    svg += `<polyline points="${d}" class="map-casing"/><polyline points="${d}" class="map-line"/>`
  }
  for (const p of c.points) {
    const [x, y] = at(p)
    if (p.kind === 'plane') {
      svg += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><g transform="rotate(${Math.round(p.heading ?? 0)})"><path d="M0,-13 L8,10 L0,5.5 L-8,10Z" class="map-plane"/></g>${p.label ? `<text y="26" text-anchor="middle" class="map-tag">${esc(p.label)}</text>` : ''}</g>`
    } else if (p.kind === 'start' || p.kind === 'end') {
      svg += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="11" class="map-dot ${p.kind}"/><text y="4.5" text-anchor="middle" class="map-mark">${esc(p.label ?? '')}</text></g>`
    } else {
      svg += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><path d="M0,0 C-9,-11 -13,-16 -13,-22 A13,13 0 1 1 13,-22 C13,-16 9,-11 0,0Z" class="map-pin"/><circle cy="-22" r="${p.label ? 8 : 4.5}" class="map-pin-hole"/>${p.label ? `<text y="-18.5" text-anchor="middle" class="map-mark dark">${esc(p.label)}</text>` : ''}</g>`
    }
  }
  const stage = h('div', { class: 'map-stage' }, tiles, h('div', { class: 'map-overlay', html: `<svg width="${MW}" height="${MH}" viewBox="0 0 ${MW} ${MH}">${svg}</svg>` }))
  const frame = h('div', { class: 'map' }, stage, c.title ? h('span', { class: 'map-title' }, c.title) : null, h('span', { class: 'map-credit' }, '© OpenStreetMap'))
  const fit = () => (stage.style.transform = `scale(${frame.clientWidth / MW})`)
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(frame)
  requestAnimationFrame(fit)
  return h('div', { class: 'card map-card' }, frame, c.stats?.length ? h('div', { class: 'map-stats' }, c.stats.map((s) => h('div', null, h('small', null, s.label), h('b', null, s.value)))) : null)
}
