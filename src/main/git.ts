import { execFile } from 'node:child_process'
import type { GitFile, GitStatus } from '../shared/ipc.js'

interface Out {
  code: number
  stdout: string
  stderr: string
}

const MAX = 300_000

/** Run git without a shell. Never throws: a non-zero exit comes back as `code`. */
export function git(cwd: string, args: string[], timeout = 30_000): Promise<Out> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      // No terminal prompts: a missing credential should fail, not hang the app.
      { cwd, timeout, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as any).code === 'number' ? (err as any).code : 1) : 0
        resolve({ code, stdout: String(stdout ?? ''), stderr: err && !stderr ? String(err.message) : String(stderr ?? '') })
      },
    )
  })
}

/** Parse `git status --porcelain=v1 -z --branch`. */
export function parseStatus(raw: string): Omit<GitStatus, 'repo'> {
  const parts = raw.split('\0')
  let branch = ''
  let upstream: string | undefined
  let ahead = 0
  let behind = 0
  const files: GitFile[] = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!p) continue
    if (p.startsWith('## ')) {
      const head = p.slice(3)
      if (head.startsWith('No commits yet on ')) branch = head.slice('No commits yet on '.length)
      else if (head.startsWith('HEAD (no branch)')) branch = 'detached HEAD'
      else {
        const [name, rest] = head.split('...')
        branch = name
        if (rest) {
          upstream = rest.split(' [')[0]
          ahead = Number(rest.match(/ahead (\d+)/)?.[1] ?? 0)
          behind = Number(rest.match(/behind (\d+)/)?.[1] ?? 0)
        }
      }
      continue
    }
    const index = p[0]
    const work = p[1]
    const file: GitFile = { path: p.slice(3), index, work }
    if (index === 'R' || index === 'C' || work === 'R' || work === 'C') file.orig = parts[++i]
    files.push(file)
  }
  return { branch, upstream, ahead, behind, files }
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  const inside = await git(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (inside.code !== 0) return { repo: false, branch: '', ahead: 0, behind: 0, files: [] }
  const st = await git(cwd, ['status', '--porcelain=v1', '-z', '--branch', '--untracked-files=all'])
  const parsed = parseStatus(st.stdout)
  // Line counts per file against HEAD (not available before the first commit).
  const num = await git(cwd, ['diff', 'HEAD', '--numstat', '--no-color', '--no-ext-diff'])
  if (num.code === 0) {
    const counts = new Map<string, [number, number]>()
    for (const line of num.stdout.split('\n')) {
      const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/)
      if (m) counts.set(m[3], [Number(m[1]) || 0, Number(m[2]) || 0])
    }
    for (const f of parsed.files) {
      const c = counts.get(f.path)
      if (c) [f.add, f.del] = c
    }
  }
  return { repo: true, ...parsed }
}

/** The change in one file against HEAD (staged and unstaged together). */
export async function gitDiff(cwd: string, file: string, untracked: boolean): Promise<string> {
  const args = untracked
    ? ['diff', '--no-index', '--no-color', '--no-ext-diff', '-U3', '--', '/dev/null', file]
    : ['diff', 'HEAD', '--no-color', '--no-ext-diff', '-U3', '--', file]
  let out = await git(cwd, args)
  // Before the first commit there is no HEAD: fall back to what is staged.
  if (!untracked && out.code !== 0 && /unknown revision|bad revision|ambiguous argument 'HEAD'/.test(out.stderr)) {
    out = await git(cwd, ['diff', '--cached', '--no-color', '--no-ext-diff', '-U3', '--', file])
  }
  // --no-index exits 1 when the files differ, which is the expected case.
  return out.stdout.length > MAX ? out.stdout.slice(0, MAX) + '\n… (diff truncated)' : out.stdout
}

const tail = (o: Out) => (o.stdout + o.stderr).trim().split('\n').slice(-12).join('\n')

/** Commit exactly the given files: whatever else was staged is unstaged first. */
export async function gitCommit(cwd: string, paths: string[], message: string): Promise<{ ok: boolean; output: string }> {
  if (!message.trim()) return { ok: false, output: 'Write a commit message first.' }
  if (!paths.length) return { ok: false, output: 'Select at least one file to commit.' }
  await git(cwd, ['reset', '-q']) // fails harmlessly before the first commit
  const add = await git(cwd, ['add', '-A', '--', ...paths])
  if (add.code !== 0) return { ok: false, output: tail(add) }
  const commit = await git(cwd, ['commit', '-m', message.trim()])
  return { ok: commit.code === 0, output: tail(commit) }
}

export async function gitPush(cwd: string, hasUpstream: boolean): Promise<{ ok: boolean; output: string }> {
  const out = await git(cwd, hasUpstream ? ['push'] : ['push', '-u', 'origin', 'HEAD'], 90_000)
  return { ok: out.code === 0, output: tail(out) || 'Pushed.' }
}

export async function gitPull(cwd: string): Promise<{ ok: boolean; output: string }> {
  const out = await git(cwd, ['pull', '--ff-only'], 90_000)
  return { ok: out.code === 0, output: tail(out) || 'Already up to date.' }
}

export async function gitInit(cwd: string): Promise<{ ok: boolean; output: string }> {
  const out = await git(cwd, ['init'])
  return { ok: out.code === 0, output: tail(out) }
}
