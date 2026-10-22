import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

/**
 * ripgrep, for fast search and file listing. The app bundles a copy (vendor/rg); otherwise one on PATH is
 * used. Without either, the tools fall back to their own (slower) directory walk.
 */
let bundled: string | undefined
let resolved: string | null | undefined

/** Called by the app with the folder that holds the bundled `rg`. */
export function setRipgrepDir(dir: string) {
  bundled = path.join(dir, process.platform === 'win32' ? 'rg.exe' : 'rg')
  resolved = undefined
}

/** The rg binary to run, or null when there is none. Checked once. */
export function ripgrep(): string | null {
  if (resolved !== undefined) return resolved
  if (process.env.CROO_NO_RG) return (resolved = null)
  if (bundled && fs.existsSync(bundled)) return (resolved = bundled)
  try {
    const r = spawnSync('rg', ['--version'], { encoding: 'utf8', timeout: 3000 })
    resolved = r.status === 0 ? 'rg' : null
  } catch {
    resolved = null
  }
  return resolved
}

/** Run rg and collect stdout. Exit code 1 means "no matches" and is not an error. Stops reading after `maxBytes`. */
export function runRg(args: string[], cwd: string, signal?: AbortSignal, maxBytes = 2_000_000): Promise<string> {
  const bin = ripgrep()
  if (!bin) return Promise.reject(new Error('ripgrep is not available.'))
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    let full = false
    child.stdout.on('data', (d: Buffer) => {
      if (full) return
      out += d.toString()
      if (out.length > maxBytes) {
        full = true
        child.kill()
      }
    })
    child.stderr.on('data', (d: Buffer) => (err += d.toString()))
    const onAbort = () => child.kill()
    signal?.addEventListener('abort', onAbort, { once: true })
    child.on('error', reject)
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort)
      if (full || code === 0 || code === 1) resolve(out)
      else reject(new Error(err.trim().split('\n').slice(-3).join('\n') || `ripgrep exited with code ${code}`))
    })
  })
}

/** Flags shared by every search: include dotfiles but never .git or node_modules, follow .gitignore even outside a repository. */
export const RG_BASE = ['--hidden', '--glob', '!.git', '--glob', '!node_modules', '--no-require-git', '--no-messages', '--max-filesize', '1M']
