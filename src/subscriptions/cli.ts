import { execFile, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SUBSCRIPTIONS, type SubscriptionId } from './catalog.js'

/** Where each CLI usually lives when it is not on PATH (an app opened from Finder has a short PATH). */
function candidates(binary: string): string[] {
  const home = os.homedir()
  return [
    ...(process.env.PATH ?? '').split(path.delimiter),
    path.join(home, '.local', 'bin'),
    path.join(home, '.claude', 'local'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.bun', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
    .filter(Boolean)
    .map((d) => path.join(d, binary))
}

/** The full path of the CLI, or null when it is not installed. */
export function findBinary(binary: string): string | null {
  for (const file of candidates(binary)) {
    try {
      fs.accessSync(file, fs.constants.X_OK)
      if (fs.statSync(file).isFile()) return file
    } catch {}
  }
  return null
}

function run(file: string, args: string[], timeout = 8000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, env: { ...process.env, NO_COLOR: '1' } }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}${stderr}`.trim() }))
  })
}

export interface CliStatus {
  id: SubscriptionId
  installed: boolean
  version?: string
  signedIn: boolean
  /** "Max plan", "ChatGPT Plus": what the CLI says you are signed in with. */
  account?: string
  /** What to do next, in plain words, when it is not ready. */
  problem?: string
}

/** Is the CLI installed, and is anyone signed in to it? Never starts a model. */
export async function detect(id: SubscriptionId): Promise<CliStatus> {
  const info = SUBSCRIPTIONS[id]
  const file = findBinary(info.binary)
  if (!file) return { id, installed: false, signedIn: false, problem: `${info.label} runs through the ${info.binary} command, which is not installed. Install it with: ${info.install}` }
  const version = (await run(file, ['--version'])).out.split('\n')[0]?.replace(/\s*\(.*\)$/, '').trim() || undefined
  const needLogin = `Sign in first by running ${info.login} in a terminal, then try again.`
  if (id === 'claude-code') {
    const r = await run(file, ['auth', 'status'])
    try {
      const j = JSON.parse(r.out)
      if (!j.loggedIn) return { id, installed: true, version, signedIn: false, problem: needLogin }
      // An API key in the environment would be billed instead of the subscription: say which one is in use.
      return { id, installed: true, version, signedIn: true, account: [j.subscriptionType, j.authMethod].filter(Boolean).join(' · ') || undefined }
    } catch {
      // Older versions have no JSON status: a successful exit is as much as we can tell.
      return r.ok ? { id, installed: true, version, signedIn: true } : { id, installed: true, version, signedIn: false, problem: needLogin }
    }
  }
  const r = await run(file, ['login', 'status'])
  const signedIn = r.ok && /logged in/i.test(r.out)
  return signedIn ? { id, installed: true, version, signedIn, account: r.out.split('\n')[0] } : { id, installed: true, version, signedIn: false, problem: needLogin }
}

export interface Spawned {
  child: ChildProcess
  /** Resolves with the exit code once the process is gone and its output has been read. */
  done: Promise<number | null>
}

/** Start a CLI and call `onLine` for each line of its stdout. Aborting stops the whole process group. */
export function spawnLines(file: string, args: string[], opts: { cwd: string; signal: AbortSignal; onLine(line: string): void; onStderr?(text: string): void; stdin?: string; env?: NodeJS.ProcessEnv }): Spawned {
  const child = spawn(file, args, { cwd: opts.cwd, detached: process.platform !== 'win32', stdio: [opts.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1', ...opts.env } })
  if (opts.stdin !== undefined) child.stdin?.end(opts.stdin)
  const kill = () => {
    if (!child.pid) return
    try {
      process.platform === 'win32' ? child.kill() : process.kill(-child.pid, 'SIGTERM')
    } catch {}
  }
  if (opts.signal.aborted) kill()
  else opts.signal.addEventListener('abort', kill, { once: true })
  let buf = ''
  child.stdout?.on('data', (d: Buffer) => {
    buf += d.toString()
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line) opts.onLine(line)
    }
  })
  child.stderr?.on('data', (d: Buffer) => opts.onStderr?.(d.toString()))
  const done = new Promise<number | null>((resolve) => {
    child.on('error', (e) => (opts.onStderr?.(`Could not start: ${e.message}`), resolve(null)))
    child.on('close', (code) => {
      if (buf.trim()) opts.onLine(buf.trim())
      opts.signal.removeEventListener('abort', kill)
      resolve(code)
    })
  })
  return { child, done }
}
