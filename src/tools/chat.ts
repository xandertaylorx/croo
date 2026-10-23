/** Tools for plain chats: a calculator, weather, places, routes, live flights, conversions and world clocks. Each returns text for the model and a card for the chat. */
import type { Card } from '../shared/ipc.js'
import type { Tool, ToolOutput } from './index.js'
import { evaluate, formatNumber } from '../chat/calc.js'
import { convertUnit, isCurrencyCode, unitLabel } from '../chat/units.js'
import { describeWeather } from '../chat/weather.js'
import { haversine, thin } from '../chat/maps.js'

const UA = 'Croo desktop app (https://github.com/xandertaylorx/croo)'

const prop = (type: string, description: string, extra: object = {}) => ({ type, description, ...extra })

async function getJson(url: string, signal?: AbortSignal, ms = 15000): Promise<any> {
  const timeout = AbortSignal.timeout(ms)
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status} ${res.statusText}`.trim())
  return res.json()
}

const q = encodeURIComponent
const num = (n: number, d = 0) => Number(n.toFixed(d))

// OpenStreetMap's geocoder asks for at most one request a second.
let lastNominatim = 0
async function nominatim(query: string, limit: number, signal?: AbortSignal): Promise<{ lat: number; lon: number; name: string; full: string; kind: string }[]> {
  const wait = lastNominatim + 1100 - Date.now()
  lastNominatim = Date.now() + Math.max(0, wait)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  const rows = await getJson(`https://nominatim.openstreetmap.org/search?q=${q(query)}&format=jsonv2&limit=${limit}`, signal)
  return (rows as any[]).map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), name: String(r.name || r.display_name).split(',')[0].trim(), full: String(r.display_name), kind: [r.category, r.type].filter(Boolean).join(' · ') }))
}

const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/

async function locate(where: string, signal?: AbortSignal): Promise<{ lat: number; lon: number; name: string }> {
  const m = where.match(COORDS)
  if (m) return { lat: Number(m[1]), lon: Number(m[2]), name: `${m[1]}, ${m[2]}` }
  const [hit] = await nominatim(where, 1, signal)
  if (!hit) throw new Error(`Could not find "${where}". Try a more specific name or add the country.`)
  return hit
}

// ---------- calculator ----------

const calculate: Tool = {
  spec: {
    name: 'calculate',
    description:
      'Work out a calculation exactly. Use it for any arithmetic beyond the trivial instead of doing it in your head: sums, percentages, powers, roots, trigonometry (radians), logs, factorials. Supports + - * / ^ mod %, brackets, pi, e, and sqrt() sin() cos() tan() ln() log() exp() abs() round() min() max() fact(). The chat shows the result as a neat card, so do not repeat the working in your reply.',
    parameters: { type: 'object', properties: { expression: prop('string', 'e.g. "15% * 80", "(3 + 4) ^ 2 / 7", "sqrt(2) * pi"') }, required: ['expression'] },
  },
  summarize: (a) => String(a.expression ?? '').slice(0, 100),
  async run(a) {
    const expression = String(a.expression ?? '').trim()
    if (!expression) throw new Error('expression is empty.')
    const value = evaluate(expression)
    const result = formatNumber(value)
    return { text: `${expression} = ${result}${String(value) !== result.replace(/,/g, '') ? ` (exactly ${value})` : ''}`, card: { type: 'calc', expression, result } }
  },
}

// ---------- weather ----------

const weather: Tool = {
  spec: {
    name: 'weather',
    description: 'Get the current weather and a 7-day forecast for a place. The chat shows a weather card, so summarise in a sentence or two (what to wear or expect) rather than listing every number.',
    parameters: {
      type: 'object',
      properties: {
        place: prop('string', 'City or town, e.g. "Lisbon" or "Portland, Oregon"'),
        units: prop('string', 'metric (°C, km/h) or imperial (°F, mph). Pick imperial for US users, otherwise metric.', { enum: ['metric', 'imperial'] }),
      },
      required: ['place'],
    },
  },
  summarize: (a) => String(a.place ?? ''),
  async run(a, ctx): Promise<ToolOutput> {
    const place = String(a.place ?? '').trim()
    if (!place) throw new Error('place is empty.')
    const imperial = a.units === 'imperial'
    const [name, ...rest] = place.split(',').map((s) => s.trim())
    const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${q(name)}&count=8&language=en&format=json`, ctx.signal)
    const results: any[] = geo.results ?? []
    const want = rest.join(' ').toLowerCase()
    const hit = (want && results.find((r) => [r.country, r.admin1, r.country_code].some((s) => s && want.includes(String(s).toLowerCase())))) || results[0]
    if (!hit) throw new Error(`Could not find a place called "${place}".`)
    const unit = imperial ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : ''
    const f = await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7&timezone=auto${unit}`,
      ctx.signal,
    )
    const c = f.current
    const start = Math.max(0, (f.hourly.time as string[]).findIndex((t) => t >= String(c.time).slice(0, 13)))
    const hourly = Array.from({ length: 8 }, (_, i) => start + i * 3)
      .filter((i) => i < f.hourly.time.length)
      .map((i) => ({ time: String(f.hourly.time[i]).slice(11, 16), temp: num(f.hourly.temperature_2m[i]), code: Number(f.hourly.weather_code[i]) }))
    const daily = (f.daily.time as string[]).map((date, i) => ({ date, code: Number(f.daily.weather_code[i]), max: num(f.daily.temperature_2m_max[i]), min: num(f.daily.temperature_2m_min[i]), rain: Number(f.daily.precipitation_probability_max[i] ?? 0) }))
    const label = [hit.name, hit.admin1, hit.country].filter((s, i, all) => s && all.indexOf(s) === i).join(', ')
    const units = imperial ? { temp: '°F', wind: 'mph' } : { temp: '°C', wind: 'km/h' }
    const now = { temp: num(c.temperature_2m), feels: num(c.apparent_temperature), humidity: Number(c.relative_humidity_2m), wind: num(c.wind_speed_10m), code: Number(c.weather_code), day: c.is_day === 1 }
    const card: Card = { type: 'weather', place: label, units, now, hourly, daily }
    const text = [
      `${label}: ${describeWeather(now.code, now.day).label}, ${now.temp}${units.temp} (feels ${now.feels}${units.temp}), humidity ${now.humidity}%, wind ${now.wind} ${units.wind}.`,
      'Forecast: ' + daily.map((d) => `${d.date} ${describeWeather(d.code).label} ${d.min}–${d.max}${units.temp}, ${d.rain}% rain`).join('; '),
    ].join('\n')
    return { text, card }
  },
}

// ---------- places and routes ----------

const place: Tool = {
  spec: {
    name: 'place',
    description: 'Find where a place is and show it on a map: cities, landmarks, addresses, businesses ("Eiffel Tower", "coffee shops near Shibuya Station"). Use it for "where is…" and "show me…" questions. The chat shows the map.',
    parameters: { type: 'object', properties: { query: prop('string', 'What to find, with a city or country if it helps'), count: prop('number', 'How many matches to show, 1 to 5 (default 3)') }, required: ['query'] },
  },
  summarize: (a) => String(a.query ?? ''),
  async run(a, ctx): Promise<ToolOutput> {
    const query = String(a.query ?? '').trim()
    if (!query) throw new Error('query is empty.')
    const hits = await nominatim(query, Math.min(5, Math.max(1, Number(a.count) || 3)), ctx.signal)
    if (!hits.length) throw new Error(`Nothing found for "${query}". Try a more specific name or add the country.`)
    const card: Card = { type: 'map', title: hits.length === 1 ? hits[0].name : query, points: hits.map((h, i) => ({ lat: h.lat, lon: h.lon, label: hits.length === 1 ? undefined : String(i + 1), kind: 'pin' as const })), stats: hits.length === 1 ? [{ label: 'Coordinates', value: `${num(hits[0].lat, 4)}, ${num(hits[0].lon, 4)}` }, ...(hits[0].kind ? [{ label: 'Type', value: hits[0].kind }] : [])] : undefined }
    return { text: hits.map((h, i) => `${i + 1}. ${h.full} (${h.kind}) at ${num(h.lat, 5)}, ${num(h.lon, 5)}`).join('\n'), card }
  },
}

const SPEED_NOTE = 'Does not include live traffic.'
const ROUTERS: Record<string, [string, string]> = { car: ['routed-car', 'by car'], bike: ['routed-bike', 'by bike'], foot: ['routed-foot', 'on foot'] }

const fmtDuration = (s: number) => {
  const m = Math.round(s / 60)
  if (m < 60) return `${Math.max(1, m)} min`
  const h = Math.floor(m / 60)
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${m % 60} min`
}

const route: Tool = {
  spec: {
    name: 'route',
    description: `Work out how far and how long it takes to get from one place to another by car, bike or on foot, and show the route on a map. Does not do flights or public transport. ${SPEED_NOTE}`,
    parameters: {
      type: 'object',
      properties: { from: prop('string', 'Starting place or "lat,lon"'), to: prop('string', 'Destination or "lat,lon"'), mode: prop('string', 'car (default), bike or foot', { enum: ['car', 'bike', 'foot'] }) },
      required: ['from', 'to'],
    },
  },
  summarize: (a) => `${a.from ?? ''} → ${a.to ?? ''}`,
  async run(a, ctx): Promise<ToolOutput> {
    const mode = ROUTERS[String(a.mode)] ? String(a.mode) : 'car'
    const [server, phrase] = ROUTERS[mode]
    const from = await locate(String(a.from ?? ''), ctx.signal)
    const to = await locate(String(a.to ?? ''), ctx.signal)
    const crow = haversine(from, to)
    let r: any
    try {
      const res = await getJson(`https://routing.openstreetmap.de/${server}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=simplified&geometries=geojson`, ctx.signal)
      r = res.routes?.[0]
    } catch {}
    if (!r) return { text: `No ${mode} route found between ${from.name} and ${to.name} (they may be across water or too far apart). The straight-line distance is ${num(crow)} km (${num(crow * 0.621371)} mi).`, card: { type: 'map', title: `${from.name} → ${to.name}`, points: [{ ...from, label: 'A', kind: 'start' }, { ...to, label: 'B', kind: 'end' }], route: [from, to], stats: [{ label: 'Straight line', value: `${num(crow)} km` }] } }
    const km = r.distance / 1000
    const path = thin((r.geometry.coordinates as [number, number][]).map(([lon, lat]) => ({ lat: num(lat, 5), lon: num(lon, 5) })))
    const card: Card = { type: 'map', title: `${from.name} → ${to.name}`, points: [{ ...from, label: 'A', kind: 'start' }, { ...to, label: 'B', kind: 'end' }], route: path, stats: [{ label: 'Distance', value: `${num(km, km < 10 ? 1 : 0)} km · ${num(km * 0.621371, km < 10 ? 1 : 0)} mi` }, { label: 'Time', value: fmtDuration(r.duration) }, { label: 'Mode', value: phrase }] }
    return { text: `${from.name} to ${to.name} ${phrase}: ${num(km, 1)} km (${num(km * 0.621371, 1)} mi), about ${fmtDuration(r.duration)}. ${mode === 'car' ? SPEED_NOTE : ''}`.trim(), card }
  },
}

// ---------- flights ----------

const flight: Tool = {
  spec: {
    name: 'flight',
    description:
      'Track a live aircraft by callsign (e.g. BAW123, UAL1, DLH400: the airline\'s three-letter ICAO code plus the number, so convert BA123 to BAW123) or by ICAO24 hex code, or list aircraft currently flying near a place. Shows position, altitude, speed and the path so far on a map. Live data from the OpenSky Network, so a flight that is not in the air or not covered by receivers will not be found.',
    parameters: { type: 'object', properties: { callsign: prop('string', 'Callsign like BAW123, or a 6-character ICAO24 hex code'), near: prop('string', 'A place: list aircraft in the air around it') } },
  },
  summarize: (a) => String(a.callsign || a.near || ''),
  async run(a, ctx): Promise<ToolOutput> {
    const call = String(a.callsign ?? '').replace(/\s+/g, '').toUpperCase()
    const near = String(a.near ?? '').trim()
    if (!call && !near) throw new Error('Give a callsign or a place.')
    let url = 'https://opensky-network.org/api/states/all'
    let centre: { lat: number; lon: number; name: string } | undefined
    if (/^[0-9A-F]{6}$/.test(call) && !/^[A-Z]{3}\d/.test(call)) url += `?icao24=${call.toLowerCase()}`
    else if (!call) {
      centre = await locate(near, ctx.signal)
      url += `?lamin=${num(centre.lat - 0.8, 3)}&lomin=${num(centre.lon - 1.2, 3)}&lamax=${num(centre.lat + 0.8, 3)}&lomax=${num(centre.lon + 1.2, 3)}`
    }
    let data: any
    try {
      data = await getJson(url, ctx.signal, 25000)
    } catch (e: any) {
      throw new Error(/429|403/.test(e.message) ? 'OpenSky\'s free live data is rate limited right now. Try again in a few minutes.' : `Could not reach the flight data: ${e.message}`)
    }
    let states: any[][] = data.states ?? []
    if (call && !url.includes('icao24')) states = states.filter((s) => String(s[1]).trim().toUpperCase() === call) || []
    if (call && !states.length && !url.includes('icao24')) states = ((data.states ?? []) as any[][]).filter((s) => String(s[1]).trim().toUpperCase().startsWith(call)).slice(0, 1)
    states = states.filter((s) => s[5] != null && s[6] != null)
    if (!states.length) return call ? `No live aircraft found for ${call}. It may not be in the air, may not be covered by OpenSky's receivers, or the callsign may differ (airlines use three-letter codes, e.g. BAW123 rather than BA123).` : `No aircraft are reporting near ${near} right now.`
    const row = (s: any[]) => ({ icao: String(s[0]), callsign: String(s[1]).trim() || String(s[0]), country: String(s[2]), lon: Number(s[5]), lat: Number(s[6]), altM: s[7] == null ? s[13] : s[7], ground: !!s[8], speed: s[9] as number | null, heading: s[10] as number | null, climb: s[11] as number | null })
    const list = states.map(row)
    if (centre) {
      const c = centre
      const nearest = list.sort((x, y) => haversine(c, x) - haversine(c, y)).slice(0, 10)
      const card: Card = { type: 'map', title: `Aircraft near ${c.name}`, points: [{ lat: c.lat, lon: c.lon, kind: 'pin' }, ...nearest.map((p) => ({ lat: p.lat, lon: p.lon, kind: 'plane' as const, heading: p.heading ?? 0, label: p.callsign }))], stats: [{ label: 'In view', value: String(list.length) }] }
      return { text: `${list.length} aircraft near ${c.name}:\n` + nearest.map((p) => `${p.callsign} (${p.country}) ${p.ground ? 'on the ground' : `${p.altM == null ? '?' : Math.round(p.altM * 3.28084).toLocaleString()} ft, ${p.speed == null ? '?' : Math.round(p.speed * 1.94384)} kn`}`).join('\n'), card }
    }
    const p = list[0]
    let trail: { lat: number; lon: number }[] | undefined
    try {
      const t = await getJson(`https://opensky-network.org/api/tracks/all?icao24=${p.icao}&time=0`, ctx.signal, 8000)
      trail = thin((t.path as any[][]).filter((w) => w[1] != null && w[2] != null).map((w) => ({ lat: num(Number(w[1]), 4), lon: num(Number(w[2]), 4) })), 120)
    } catch {}
    const ft = p.altM == null ? null : Math.round(p.altM * 3.28084)
    const kn = p.speed == null ? null : Math.round(p.speed * 1.94384)
    const stats = [
      { label: 'Altitude', value: p.ground ? 'On the ground' : ft == null ? 'Unknown' : `${ft.toLocaleString()} ft` },
      { label: 'Speed', value: kn == null ? 'Unknown' : `${kn} kn · ${Math.round((p.speed ?? 0) * 3.6)} km/h` },
      { label: 'Heading', value: p.heading == null ? 'Unknown' : `${Math.round(p.heading)}°` },
      { label: 'Registered in', value: p.country },
    ]
    const card: Card = { type: 'map', title: p.callsign, points: [{ lat: p.lat, lon: p.lon, kind: 'plane', heading: p.heading ?? 0 }], route: trail && trail.length > 1 ? trail : undefined, stats }
    return { text: `${p.callsign} (${p.country}): ${p.ground ? 'on the ground' : `${ft?.toLocaleString() ?? '?'} ft, ${kn ?? '?'} kn, heading ${p.heading == null ? '?' : Math.round(p.heading)}°`}, at ${num(p.lat, 3)}, ${num(p.lon, 3)}. Origin and destination are not in this data.`, card }
  },
}

// ---------- conversions and clocks ----------

const convert: Tool = {
  spec: {
    name: 'convert',
    description: 'Convert between units (length, mass, volume, speed, area, time, data, temperature) or currencies using the latest rates. The chat shows a conversion card.',
    parameters: { type: 'object', properties: { value: prop('number', 'The amount to convert'), from: prop('string', 'Unit or currency code, e.g. "km", "lb", "celsius", "USD"'), to: prop('string', 'Unit or currency code to convert to') }, required: ['value', 'from', 'to'] },
  },
  summarize: (a) => `${a.value ?? ''} ${a.from ?? ''} → ${a.to ?? ''}`,
  async run(a, ctx): Promise<ToolOutput> {
    const value = Number(a.value)
    if (!Number.isFinite(value)) throw new Error('value must be a number.')
    const from = String(a.from ?? '').trim()
    const to = String(a.to ?? '').trim()
    const local = convertUnit(value, from, to)
    if (local) {
      const f = `${formatNumber(value)} ${unitLabel(local.from)}`
      const t = `${formatNumber(local.value)} ${unitLabel(local.to)}`
      return { text: `${f} = ${t}`, card: { type: 'convert', from: f, to: t } }
    }
    if (isCurrencyCode(from) && isCurrencyCode(to)) {
      const [a1, b1] = [from.toUpperCase(), to.toUpperCase()]
      const data = await getJson(`https://api.frankfurter.dev/v1/latest?base=${a1}&symbols=${b1}`, ctx.signal)
      const rate = data.rates?.[b1]
      if (typeof rate !== 'number') throw new Error(`No exchange rate for ${a1} to ${b1}.`)
      const f = `${formatNumber(value)} ${a1}`
      const t = `${formatNumber(Number((value * rate).toFixed(4)))} ${b1}`
      return { text: `${f} = ${t} (1 ${a1} = ${rate} ${b1}, European Central Bank rates from ${data.date})`, card: { type: 'convert', from: f, to: t, note: `1 ${a1} = ${rate} ${b1} · ${data.date}` } }
    }
    throw new Error(`Cannot convert "${from}" to "${to}": the units are unknown or measure different things.`)
  },
}

const timeIn: Tool = {
  spec: {
    name: 'time_in',
    description: 'Get the current local time and date in a city or time zone, and how far ahead or behind the user it is. The chat shows a clock card.',
    parameters: { type: 'object', properties: { place: prop('string', 'A city ("Tokyo") or an IANA zone ("America/New_York")') }, required: ['place'] },
  },
  summarize: (a) => String(a.place ?? ''),
  async run(a, ctx): Promise<ToolOutput> {
    const where = String(a.place ?? '').trim()
    if (!where) throw new Error('place is empty.')
    let zone = ''
    let name = where
    try {
      if (where.includes('/')) new Intl.DateTimeFormat('en', { timeZone: where }), (zone = where)
    } catch {}
    if (!zone) {
      const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${q(where.split(',')[0].trim())}&count=1&language=en&format=json`, ctx.signal)
      const hit = geo.results?.[0]
      if (!hit?.timezone) throw new Error(`Could not find a time zone for "${where}".`)
      zone = hit.timezone
      name = [hit.name, hit.country].filter(Boolean).join(', ')
    }
    const now = new Date()
    const time = now.toLocaleTimeString([], { timeZone: zone, hour: 'numeric', minute: '2-digit' })
    const date = now.toLocaleDateString([], { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' })
    const offset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? ''
    const diff = (new Date(now.toLocaleString('en-US', { timeZone: zone })).getTime() - new Date(now.toLocaleString('en-US')).getTime()) / 3.6e6
    const note = Math.abs(diff) < 0.01 ? 'Same time as you' : `${Math.abs(num(diff, 1))} hour${Math.abs(diff) === 1 ? '' : 's'} ${diff > 0 ? 'ahead of' : 'behind'} you`
    return { text: `It is ${time} on ${date} in ${name} (${zone}, ${offset}). ${note}.`, card: { type: 'clock', place: name, time, date, zone: `${zone} · ${offset}`, note } }
  },
}

export const CHAT_TOOLS: Tool[] = [calculate, weather, place, route, flight, convert, timeIn]
