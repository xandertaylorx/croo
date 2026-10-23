/** Unit conversion that works offline: a table of factors per kind of quantity, and temperatures by formula. */

interface Kind {
  units: Record<string, number>
}

const KINDS: Kind[] = [
  { units: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852 } },
  { units: { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318, t: 1000 } },
  { units: { l: 1, ml: 0.001, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365, floz: 0.0295735295625, tbsp: 0.01478676478125, tsp: 0.00492892159375, galuk: 4.54609 } },
  { units: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, kn: 0.514444, 'ft/s': 0.3048 } },
  { units: { m2: 1, km2: 1e6, ha: 1e4, acre: 4046.8564224, ft2: 0.09290304, mi2: 2589988.110336 } },
  { units: { s: 1, ms: 0.001, min: 60, h: 3600, day: 86400, week: 604800, year: 31557600 } },
  { units: { bit: 0.125, B: 1, KB: 1000, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 1048576, GiB: 1073741824 } },
]

const ALIASES: Record<string, string> = {
  meter: 'm', meters: 'm', metre: 'm', metres: 'm', kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km', centimeter: 'cm', centimeters: 'cm', millimeter: 'mm', millimeters: 'mm',
  mile: 'mi', miles: 'mi', yard: 'yd', yards: 'yd', foot: 'ft', feet: 'ft', inch: 'in', inches: 'in', 'nautical mile': 'nmi', 'nautical miles': 'nmi',
  kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg', gram: 'g', grams: 'g', milligram: 'mg', milligrams: 'mg', pound: 'lb', pounds: 'lb', lbs: 'lb', ounce: 'oz', ounces: 'oz', stone: 'st', tonne: 't', tonnes: 't', ton: 't',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', gallon: 'gal', gallons: 'gal', quart: 'qt', quarts: 'qt', pint: 'pt', pints: 'pt', cups: 'cup',
  'fl oz': 'floz', 'fluid ounce': 'floz', 'fluid ounces': 'floz', tablespoon: 'tbsp', tablespoons: 'tbsp', teaspoon: 'tsp', teaspoons: 'tsp', 'uk gallon': 'galuk', 'imperial gallon': 'galuk',
  kph: 'km/h', kmh: 'km/h', 'km/hr': 'km/h', 'kilometers per hour': 'km/h', 'miles per hour': 'mph', knot: 'kn', knots: 'kn', mps: 'm/s', 'meters per second': 'm/s', fps: 'ft/s',
  'sq m': 'm2', 'm²': 'm2', 'sq km': 'km2', 'km²': 'km2', hectare: 'ha', hectares: 'ha', acres: 'acre', 'sq ft': 'ft2', 'ft²': 'ft2', 'square feet': 'ft2', 'square meters': 'm2', 'square miles': 'mi2', 'sq mi': 'mi2',
  second: 's', seconds: 's', sec: 's', millisecond: 'ms', milliseconds: 'ms', minute: 'min', minutes: 'min', hour: 'h', hours: 'h', hr: 'h', hrs: 'h', days: 'day', weeks: 'week', years: 'year', yr: 'year',
  bits: 'bit', byte: 'B', bytes: 'B', kilobyte: 'KB', kilobytes: 'KB', megabyte: 'MB', megabytes: 'MB', gigabyte: 'GB', gigabytes: 'GB', terabyte: 'TB', terabytes: 'TB',
  celsius: 'c', centigrade: 'c', '°c': 'c', fahrenheit: 'f', '°f': 'f', kelvin: 'k',
}

const TEMPS = new Set(['c', 'f', 'k'])

function canon(u: string): string {
  const raw = u.trim()
  const lower = raw.toLowerCase()
  if (ALIASES[lower]) return ALIASES[lower]
  for (const k of KINDS) {
    if (raw in k.units) return raw
    if (lower in k.units) return lower
  }
  return TEMPS.has(lower) ? lower : raw
}

const kindOf = (u: string) => KINDS.find((k) => u in k.units)

const toC = (v: number, u: string) => (u === 'c' ? v : u === 'f' ? ((v - 32) * 5) / 9 : v - 273.15)
const fromC = (v: number, u: string) => (u === 'c' ? v : u === 'f' ? (v * 9) / 5 + 32 : v + 273.15)

/** The converted number and the canonical unit names, or null when the units are unknown or do not match. */
export function convertUnit(value: number, from: string, to: string): { value: number; from: string; to: string } | null {
  const a = canon(from)
  const b = canon(to)
  if (TEMPS.has(a) && TEMPS.has(b)) return { value: fromC(toC(value, a), b), from: a, to: b }
  const ka = kindOf(a)
  if (!ka || ka !== kindOf(b)) return null
  return { value: (value * ka.units[a]) / ka.units[b], from: a, to: b }
}

export const isCurrencyCode = (s: string) => /^[A-Za-z]{3}$/.test(s.trim()) && !kindOf(canon(s)) && !TEMPS.has(canon(s))

export const unitLabel = (u: string) => (TEMPS.has(u) ? `°${u.toUpperCase()}` : u)
