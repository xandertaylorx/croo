/** Web Mercator maths for drawing a map out of 256px tiles. */

export const TILE = 256
export const worldSize = (z: number) => TILE * 2 ** z

export function project(lat: number, lon: number, z: number): { x: number; y: number } {
  const s = worldSize(z)
  const sin = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180)
  return { x: ((lon + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s }
}

export interface View {
  z: number
  /** World pixel position of the middle of the map at this zoom. */
  cx: number
  cy: number
}

/** The most zoomed-in view that still shows every point inside a `w` × `h` box with `pad` to spare. */
export function fitView(pts: { lat: number; lon: number }[], w: number, h: number, pad = 36, single = 13, max = 16): View {
  if (!pts.length) return { z: 2, cx: worldSize(2) / 2, cy: worldSize(2) / 2 }
  if (pts.length === 1) {
    const p = project(pts[0].lat, pts[0].lon, single)
    return { z: single, cx: p.x, cy: p.y }
  }
  for (let z = max; z >= 1; z--) {
    const xy = pts.map((p) => project(p.lat, p.lon, z))
    const xs = xy.map((p) => p.x)
    const ys = xy.map((p) => p.y)
    const bw = Math.max(...xs) - Math.min(...xs)
    const bh = Math.max(...ys) - Math.min(...ys)
    if (bw <= w - 2 * pad && bh <= h - 2 * pad) return { z, cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2 }
  }
  return { z: 1, cx: worldSize(1) / 2, cy: worldSize(1) / 2 }
}

/** Every tile needed to cover the box, with where its top-left corner lands inside it. */
export function tilesFor(v: View, w: number, h: number): { z: number; x: number; y: number; left: number; top: number }[] {
  const n = 2 ** v.z
  const x0 = v.cx - w / 2
  const y0 = v.cy - h / 2
  const out = []
  for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y0 + h) / TILE); ty++) {
    if (ty < 0 || ty >= n) continue
    for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + w) / TILE); tx++) out.push({ z: v.z, x: ((tx % n) + n) % n, y: ty, left: tx * TILE - x0, top: ty * TILE - y0 })
  }
  return out
}

/** Keep a long path to about `max` points so it stays light to store and draw. */
export function thin<T>(pts: T[], max = 150): T[] {
  if (pts.length <= max) return pts
  const step = (pts.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)])
}

/** Great-circle distance in kilometres. */
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}
