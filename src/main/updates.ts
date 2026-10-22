import type { UpdateInfo } from '../shared/ipc.js'
import { spawn, execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { compareVersions, pickAsset, pickZip, type ReleaseAsset } from '../version.js'

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
    return { ok: true, update: { version: rel.tag_name.replace(/^v/i, ''), url: asset?.browser_download_url ?? rel.html_url ?? `https://github.com/${GITHUB_REPO}/releases`, zip: platform === 'darwin' ? pickZip(rel.assets ?? [], arch)?.browser_download_url : undefined, page: rel.html_url ?? `https://github.com/${GITHUB_REPO}/releases`, notes: rel.body?.slice(0, 600) } }
  } catch {
    return { ok: false, error: "Couldn't reach GitHub." }
  }
}

/** The .app bundle this process is running from, if it is a packaged macOS app. */
export function runningBundle(execPath = process.execPath): string | undefined {
  const m = execPath.match(/^(.*?\.app)\/Contents\//)
  return m?.[1]
}

/**
 * Download the release zip, unpack it, and start a detached script that waits for this process to exit,
 * swaps the bundle in place and relaunches it. The caller quits the app when this resolves ok.
 */
export async function stageUpdate(zipUrl: string, bundle: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-update-'))
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK)
    const res = await fetch(zipUrl, { headers: { 'user-agent': 'croo-app' }, redirect: 'follow' })
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`)
    const zip = path.join(dir, 'update.zip')
    fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
    const out = path.join(dir, 'out')
    fs.mkdirSync(out)
    await promisify(execFile)('/usr/bin/ditto', ['-x', '-k', zip, out])
    const fresh = path.join(out, path.basename(bundle))
    if (!fs.existsSync(path.join(fresh, 'Contents', 'MacOS'))) throw new Error('The download did not contain the app.')
    const script = path.join(dir, 'swap.sh')
    fs.writeFileSync(
      script,
      `#!/bin/bash
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done
rm -rf "$2.old"
mv "$2" "$2.old" && mv "$1" "$2" && rm -rf "$2.old" || { [ -d "$2.old" ] && [ ! -d "$2" ] && mv "$2.old" "$2"; }
xattr -cr "$2" 2>/dev/null
open "$2"
rm -rf "${dir}"
`,
      { mode: 0o755 },
    )
    spawn('/bin/bash', [script, fresh, bundle], { detached: true, stdio: 'ignore' }).unref()
    return { ok: true }
  } catch (e: any) {
    fs.rmSync(dir, { recursive: true, force: true })
    return { ok: false, error: e?.code === 'EACCES' ? "Croo can't write to its folder. Download the update instead." : String(e?.message ?? e) }
  }
}
