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
