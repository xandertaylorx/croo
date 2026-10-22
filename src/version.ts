/** Compare dotted versions like "0.6.0" or "v1.2.3-beta": negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d
  }
  // 1.0.0-beta is older than 1.0.0
  return Number(a.includes('-')) - Number(b.includes('-')) > 0 ? -1 : Number(b.includes('-')) - Number(a.includes('-')) > 0 ? 1 : 0
}

export interface ReleaseAsset {
  name: string
  browser_download_url: string
}

/** The macOS zip build for this machine: what the app downloads to replace itself. */
export function pickZip(assets: ReleaseAsset[], arch: string): ReleaseAsset | undefined {
  const zips = assets.filter((a) => /\.zip$/i.test(a.name))
  const wantArm = arch === 'arm64'
  return zips.find((a) => (wantArm ? /arm64/i.test(a.name) : !/arm64/i.test(a.name)))
}

/** The installer for this machine, if the release has one; otherwise the caller falls back to the release page. */
export function pickAsset(assets: ReleaseAsset[], platform: string, arch: string): ReleaseAsset | undefined {
  const ext = platform === 'darwin' ? /\.dmg$/i : platform === 'win32' ? /\.exe$/i : /\.AppImage$/i
  const candidates = assets.filter((a) => ext.test(a.name))
  const wantArm = arch === 'arm64'
  return candidates.find((a) => (wantArm ? /arm64/i.test(a.name) : !/arm64/i.test(a.name))) ?? candidates[0]
}
