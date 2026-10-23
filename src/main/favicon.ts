/** Site icons for the source chips. Fetched by the main process (the page CSP blocks images from the web) from the site itself, never a third-party icon service. */

const cache = new Map<string, string | null>()
const MAX_BYTES = 120_000

/** Only public-looking host names: no addresses, no localhost, no odd characters. */
export const iconHost = (host: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) && !/^\d+(\.\d+){3}$/.test(host)

export async function favicon(host: string): Promise<string | null> {
  host = host.toLowerCase()
  if (!iconHost(host)) return null
  if (cache.has(host)) return cache.get(host)!
  let out: string | null = null
  try {
    const res = await fetch(`https://${host}/favicon.ico`, { redirect: 'follow', signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; Croo)' } })
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (res.ok && (/^image\/(png|x-icon|vnd\.microsoft\.icon|svg\+xml|webp|gif|jpeg)$/.test(type) || type === 'application/octet-stream')) {
      const buf = Buffer.from(await res.arrayBuffer())
      // Some servers answer with an HTML error page that claims to be an icon; the real ones are small and are not text.
      if (buf.length > 0 && buf.length <= MAX_BYTES && (type === 'image/svg+xml' || !/^\s*</.test(buf.subarray(0, 16).toString('utf8')))) {
        out = `data:${type === 'application/octet-stream' ? 'image/x-icon' : type};base64,${buf.toString('base64')}`
      }
    }
  } catch {}
  cache.set(host, out)
  return out
}

const tiles = new Map<string, string | null>()

/** One map tile from OpenStreetMap's public servers, cached for the session. */
export async function tile(z: number, x: number, y: number): Promise<string | null> {
  if (![z, x, y].every(Number.isInteger) || z < 1 || z > 18) return null
  const n = 2 ** z
  if (y < 0 || y >= n) return null
  x = ((x % n) + n) % n
  const key = `${z}/${x}/${y}`
  if (tiles.has(key)) return tiles.get(key)!
  let out: string | null = null
  try {
    const res = await fetch(`https://tile.openstreetmap.org/${key}.png`, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Croo desktop app (https://github.com/xandertaylorx/croo)' } })
    if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) out = `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
  } catch {}
  if (tiles.size > 500) tiles.delete(tiles.keys().next().value!)
  if (out) tiles.set(key, out)
  return out
}
