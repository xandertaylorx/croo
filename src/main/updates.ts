import type { UpdateInfo } from '../shared/ipc.js'
import { compareVersions, pickAsset, type ReleaseAsset } from '../version.js'

export const GITHUB_REPO = 'xandertaylorx/croo'

/** The newest published GitHub release, if it is newer than what is running. Never throws. */
export async function checkLatest(current: string, platform = process.platform, arch = process.arch): Promise<{ ok: true; update?: UpdateInfo } | { ok: false; error: string }> {
  try {
    // CROO_UPDATE_URL lets tests point this at a local server.
    const res = await fetch(process.env.CROO_UPDATE_URL ?? `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'croo-app' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 404) return { ok: true } // no release published yet
    if (!res.ok) return { ok: false, error: `GitHub answered ${res.status}.` }
    const rel = (await res.json()) as { tag_name?: string; html_url?: string; body?: string; assets?: ReleaseAsset[] }
    if (!rel.tag_name || compareVersions(rel.tag_name, current) <= 0) return { ok: true }
    const asset = pickAsset(rel.assets ?? [], platform, arch)
    return { ok: true, update: { version: rel.tag_name.replace(/^v/i, ''), url: asset?.browser_download_url ?? rel.html_url ?? `https://github.com/${GITHUB_REPO}/releases`, page: rel.html_url ?? `https://github.com/${GITHUB_REPO}/releases`, notes: rel.body?.slice(0, 600) } }
  } catch {
    return { ok: false, error: "Couldn't reach GitHub." }
  }
}
