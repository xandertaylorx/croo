import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluate, formatNumber } from '../src/chat/calc.js'
import { convertUnit, isCurrencyCode } from '../src/chat/units.js'
import { fitView, haversine, project, thin, tilesFor } from '../src/chat/maps.js'
import { describeWeather } from '../src/chat/weather.js'
import { parseChart, renderChart } from '../src/renderer/chart.js'
import { renderMarkdown } from '../src/renderer/markdown.js'
import { CHAT_TOOLS, toolByName } from '../src/tools/index.js'
import { toItems } from '../src/transcript.js'

afterEach(() => vi.unstubAllGlobals())

describe('calculator', () => {
  it('follows the usual order of operations', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14)
    expect(evaluate('(2 + 3) * 4')).toBe(20)
    expect(evaluate('2 ^ 3 ^ 2')).toBe(512)
    expect(evaluate('-2 ^ 2')).toBe(-4)
    expect(evaluate('10 mod 4')).toBe(2)
    expect(evaluate('15% * 80')).toBeCloseTo(12)
    expect(evaluate('5!')).toBe(120)
  })
  it('knows functions, constants and symbols', () => {
    expect(evaluate('sqrt(16) + max(1, 7, 3)')).toBe(11)
    expect(evaluate('2 × π')).toBeCloseTo(6.283185, 5)
    expect(evaluate('1,000 + 250')).toBe(1250)
    expect(evaluate('round(2.5) ÷ 5')).toBe(0.6)
  })
  it('refuses nonsense instead of running it', () => {
    for (const bad of ['1 / 0', 'foo(2)', '2 +', 'process.exit()', '(1', 'sqrt', 'alert(1)']) expect(() => evaluate(bad)).toThrow()
  })
  it('formats readable numbers', () => {
    expect(formatNumber(1234567.891)).toBe('1,234,567.891')
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(1e20)).toBe('1 × 10^20')
  })
})

describe('units', () => {
  it('converts lengths, temperatures and speeds', () => {
    expect(convertUnit(10, 'km', 'miles')!.value).toBeCloseTo(6.2137, 3)
    expect(convertUnit(100, 'celsius', 'F')!.value).toBeCloseTo(212)
    expect(convertUnit(0, 'K', 'c')!.value).toBeCloseTo(-273.15)
    expect(convertUnit(60, 'mph', 'km/h')!.value).toBeCloseTo(96.56, 1)
    expect(convertUnit(1, 'GB', 'MB')!.value).toBe(1000)
  })
  it('does not mix kinds and spots currencies', () => {
    expect(convertUnit(1, 'kg', 'm')).toBeNull()
    expect(isCurrencyCode('USD')).toBe(true)
    expect(isCurrencyCode('kg')).toBe(false)
    expect(isCurrencyCode('min')).toBe(false)
  })
})

describe('map maths', () => {
  it('puts the equator and the prime meridian in the middle of the world', () => {
    const p = project(0, 0, 2)
    expect(p.x).toBeCloseTo(512)
    expect(p.y).toBeCloseTo(512)
  })
  it('fits two cities and covers the box with tiles', () => {
    const london = { lat: 51.5, lon: -0.12 }
    const paris = { lat: 48.85, lon: 2.35 }
    const v = fitView([london, paris], 640, 280)
    expect(v.z).toBeGreaterThan(4)
    expect(v.z).toBeLessThan(9)
    const tiles = tilesFor(v, 640, 280)
    expect(tiles.length).toBeGreaterThan(3)
    expect(tiles.every((t) => t.left > -256 && t.left < 640 && t.top > -256 && t.top < 280)).toBe(true)
  })
  it('measures distance and thins long paths', () => {
    expect(haversine({ lat: 51.5, lon: -0.12 }, { lat: 48.85, lon: 2.35 })).toBeGreaterThan(330)
    expect(haversine({ lat: 51.5, lon: -0.12 }, { lat: 48.85, lon: 2.35 })).toBeLessThan(350)
    const long = Array.from({ length: 1000 }, (_, i) => i)
    const t = thin(long, 100)
    expect(t).toHaveLength(100)
    expect(t[0]).toBe(0)
    expect(t[99]).toBe(999)
  })
  it('describes weather codes', () => {
    expect(describeWeather(0).label).toBe('Clear sky')
    expect(describeWeather(95).emoji).toBe('⛈️')
    expect(describeWeather(12345).label).toBe('Unknown')
  })
})

describe('charts', () => {
  it('reads each way of writing a spec', () => {
    expect(parseChart('{"type":"pie","data":[{"label":"A","value":3},{"label":"B","value":1}]}')!.series[0].values).toEqual([3, 1])
    expect(parseChart('{"labels":["a","b"],"series":[{"name":"x","values":[1,2]},{"name":"y","values":[3]}]}')!.series[1].values).toEqual([3, 0])
    expect(parseChart('{"type":"line","labels":["a"],"values":[5]}')).not.toBeNull()
    expect(parseChart('not json')).toBeNull()
    expect(parseChart('{"type":"bar"}')).toBeNull()
  })
  it('draws every kind as svg and escapes the text', () => {
    for (const type of ['bar', 'line', 'area', 'pie', 'donut']) {
      const svg = renderChart(JSON.stringify({ type, title: 'T <b>', labels: ['Jan', 'Feb', 'Mar'], series: [{ name: 'S', values: [3, -1, 7] }] }))!
      expect(svg).toContain('<svg')
      expect(svg).not.toContain('<b>')
    }
  })
  it('turns a chart block in a reply into a figure, waits while it streams, and falls back to code', () => {
    const ok = renderMarkdown('Here:\n```chart\n{"type":"bar","labels":["a","b"],"values":[1,2]}\n```\nDone')
    expect(ok).toContain('<figure class="chart">')
    expect(renderMarkdown('```chart\n{"type":"bar","lab')).toContain('Drawing chart')
    expect(renderMarkdown('```chart\nnope\n```')).toContain('class="code"')
  })
})

describe('chat tools', () => {
  const run = (name: string, args: object) => toolByName(name)!.run(args, { cwd: '.' } as any)

  it('are all registered with a name the chat can describe', () => {
    expect(CHAT_TOOLS.map((t) => t.spec.name)).toEqual(['calculate', 'weather', 'place', 'route', 'flight', 'convert', 'time_in'])
    expect(toolByName('weather')!.summarize({ place: 'Oslo' })).toBe('Oslo')
  })
  it('calculate returns a card', async () => {
    const out = (await run('calculate', { expression: '12 * 12' })) as { text: string; card: any }
    expect(out.text).toBe('12 * 12 = 144')
    expect(out.card).toEqual({ type: 'calc', expression: '12 * 12', result: '144' })
  })
  it('convert works offline for units and asks the rate service for currency', async () => {
    const unit = (await run('convert', { value: 5, from: 'miles', to: 'km' })) as { card: any }
    expect(unit.card.to).toContain('8.04672 km')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ date: '2026-10-23', rates: { EUR: 0.9 } }))))
    const cur = (await run('convert', { value: 100, from: 'usd', to: 'eur' })) as { card: any }
    expect(cur.card.to).toBe('90 EUR')
  })
  it('weather builds a card from the forecast service', async () => {
    const times = Array.from({ length: 48 }, (_, i) => `2026-10-23T${String(i % 24).padStart(2, '0')}:00`)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        new Response(
          JSON.stringify(
            String(url).includes('geocoding')
              ? { results: [{ name: 'Lisbon', country: 'Portugal', latitude: 38.7, longitude: -9.1 }] }
              : {
                  current: { time: '2026-10-23T10:15', temperature_2m: 18.4, apparent_temperature: 17.2, relative_humidity_2m: 70, weather_code: 2, wind_speed_10m: 12, is_day: 1 },
                  hourly: { time: times, temperature_2m: times.map(() => 17), weather_code: times.map(() => 1) },
                  daily: { time: ['2026-10-23', '2026-10-24'], weather_code: [2, 61], temperature_2m_max: [20, 18], temperature_2m_min: [13, 12], precipitation_probability_max: [10, 80] },
                },
          ),
        ),
      ),
    )
    const out = (await run('weather', { place: 'Lisbon' })) as { text: string; card: any }
    expect(out.card.type).toBe('weather')
    expect(out.card.place).toBe('Lisbon, Portugal')
    expect(out.card.hourly[0].time).toBe('10:00')
    expect(out.card.daily).toHaveLength(2)
    expect(out.text).toContain('Partly cloudy')
  })
  it('keep their card when a chat is reopened', () => {
    const items = toItems([
      { role: 'user', content: 'what is 2+2' },
      { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'calculate', args: { expression: '2+2' } }] },
      { role: 'tool', toolCallId: 't1', name: 'calculate', content: '2+2 = 4', card: { type: 'calc', expression: '2+2', result: '4' } },
    ])
    const tool = items.find((i) => i.kind === 'tool')
    expect(tool && tool.kind === 'tool' && tool.card).toEqual({ type: 'calc', expression: '2+2', result: '4' })
  })
})
