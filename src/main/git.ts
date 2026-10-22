import { execFile } from 'node:child_process'
import type { GitFile, GitResult, GitStatus } from '../shared/ipc.js'

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
export function parseStatus(raw: string): Omit<GitStatus, 'repo' | 'remotes' | 'gh'> {
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

let ghCache: { at: number; ok: boolean } | null = null

/** Is the GitHub CLI installed and signed in? Cached briefly: it is only asked about when there is no remote. */
export function ghReady(): Promise<boolean> {
  if (ghCache && Date.now() - ghCache.at < 60_000) return Promise.resolve(ghCache.ok)
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'status'], { timeout: 6000 }, (err) => {
      ghCache = { at: Date.now(), ok: !err }
      resolve(!err)
    })
  })
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  const inside = await git(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (inside.code !== 0) return { repo: false, branch: '', ahead: 0, behind: 0, files: [], remotes: [], gh: false }
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
  const remotes = (await git(cwd, ['remote'])).stdout.split('\n').filter(Boolean)
  return { repo: true, ...parsed, remotes, gh: remotes.length ? false : await ghReady() }
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
export async function gitCommit(cwd: string, paths: string[], message: string): Promise<GitResult> {
  if (!message.trim()) return { ok: false, output: 'Write a commit message first.' }
  if (!paths.length) return { ok: false, output: 'Select at least one file to commit.' }
  await git(cwd, ['reset', '-q']) // fails harmlessly before the first commit
  const add = await git(cwd, ['add', '-A', '--', ...paths])
  if (add.code !== 0) return { ok: false, output: tail(add) }
  const commit = await git(cwd, ['commit', '-m', message.trim()])
  return { ok: commit.code === 0, output: tail(commit) }
}

/** Plain-language explanations for the git failures people actually hit. */
export function friendlyGitError(output: string): string | undefined {
  const rules: [RegExp, string][] = [
    [/does not appear to be a git repository|No configured push destination|No such remote|no upstream/i, 'No remote is connected yet. Use Publish to connect one.'],
    [/Authentication failed|could not read Username|terminal prompts disabled|Permission denied \(publickey\)|Invalid username or password|HTTP 40[13]|requested URL returned error: 40[13]/i, 'Git could not sign in to the remote. Run "gh auth login" in the terminal (or use an SSH address), then try again.'],
    [/non-fast-forward|fetch first|Updates were rejected|\(behind\)|tip of your current branch is behind/i, 'The remote has newer commits. Pull first, then push again.'],
    [/src refspec .* does not match any|does not have any commits|no commits yet|unknown revision or path not in the working tree.*HEAD/i, 'There is nothing to push yet. Commit something first.'],
    [/Could not resolve host|unable to access.*(resolve|connect)|Network is unreachable|Connection (timed out|refused)/i, 'Cannot reach the remote. Check your internet connection.'],
    [/Repository not found|does not exist|ERROR: Repository|not found/i, 'That repository does not exist, or your account cannot see it.'],
    [/divergent branches|not possible to fast-forward|Not possible to fast-forward/i, 'Your branch and the remote have both changed. Resolve this in the terminal (git pull --rebase), then push.'],
    [/would be overwritten by merge|Please commit your changes or stash/i, 'You have uncommitted changes in the way. Commit or discard them, then pull.'],
  ]
  return rules.find(([re]) => re.test(output))?.[1]
}

const result = (o: Out, fallback: string): GitResult => {
  const text = tail(o)
  return { ok: o.code === 0, output: text || (o.code === 0 ? fallback : 'Git failed without saying why.'), hint: o.code === 0 ? undefined : friendlyGitError(text) }
}

export async function gitPush(cwd: string, hasUpstream: boolean): Promise<GitResult> {
  const remotes = (await git(cwd, ['remote'])).stdout.split('\n').filter(Boolean)
  if (!remotes.length) return { ok: false, output: '', hint: 'No remote is connected yet. Use Publish to connect one.' }
  const remote = remotes.includes('origin') ? 'origin' : remotes[0]
  return result(await git(cwd, hasUpstream ? ['push'] : ['push', '-u', remote, 'HEAD'], 90_000), 'Pushed.')
}

export async function gitPull(cwd: string): Promise<GitResult> {
  return result(await git(cwd, ['pull', '--ff-only'], 90_000), 'Already up to date.')
}

/** "owner/repo" means GitHub; URLs and local paths are used as given. Anything that could be read as an option is refused. */
export function normalizeRemote(input: string): string | null {
  const t = input.trim()
  if (!t || t.startsWith('-') || /\s/.test(t)) return null
  if (/^[\w.-]+\/[\w.-]+$/.test(t) && !t.startsWith('.') && !t.startsWith('/')) return `https://github.com/${t.replace(/\.git$/, '')}.git`
  if (/^(https?:\/\/|ssh:\/\/|git:\/\/|file:\/\/|git@|\/|~\/)/.test(t)) return t
  return null
}

/** Point origin at the given remote and push the current branch to it. */
export async function gitConnect(cwd: string, remote: string): Promise<GitResult> {
  const url = normalizeRemote(remote)
  if (!url) return { ok: false, output: '', hint: 'Enter a repository address like https://github.com/you/project.git, or just you/project.' }
  if ((await git(cwd, ['rev-parse', '--verify', '-q', 'HEAD'])).code !== 0) return { ok: false, output: '', hint: 'There is nothing to push yet. Commit something first.' }
  const existing = (await git(cwd, ['remote'])).stdout.split('\n').includes('origin')
  const set = await git(cwd, existing ? ['remote', 'set-url', 'origin', url] : ['remote', 'add', 'origin', url])
  if (set.code !== 0) return result(set, '')
  return result(await git(cwd, ['push', '-u', 'origin', 'HEAD'], 90_000), 'Pushed.')
}

/** Create the repository on GitHub with the gh CLI, add it as origin and push. */
export async function gitPublish(cwd: string, name: string, isPrivate: boolean): Promise<GitResult> {
  if (!/^[\w.-]+$/.test(name) || name.startsWith('-')) return { ok: false, output: '', hint: 'Repository names can only use letters, numbers, dots, dashes and underscores.' }
  if (!(await ghReady())) return { ok: false, output: '', hint: 'The GitHub CLI is not signed in. Run "gh auth login" in the terminal, or paste a repository address instead.' }
  if ((await git(cwd, ['rev-parse', '--verify', '-q', 'HEAD'])).code !== 0) return { ok: false, output: '', hint: 'There is nothing to push yet. Commit something first.' }
  const out = await new Promise<Out>((resolve) => {
    execFile('gh', ['repo', 'create', name, isPrivate ? '--private' : '--public', '--source=.', '--remote=origin', '--push'], { cwd, timeout: 120_000 }, (err, stdout, stderr) =>
      resolve({ code: err ? 1 : 0, stdout: String(stdout), stderr: String(stderr || (err ? err.message : '')) }),
    )
  })
  const r = result(out, 'Created and pushed.')
  if (!r.ok && /already exists/i.test(r.output)) r.hint = 'A repository with that name already exists on your account. Pick another name, or paste its address instead.'
  return r
}

export async function gitInit(cwd: string): Promise<GitResult> {
  const out = await git(cwd, ['init'])
  return { ok: out.code === 0, output: tail(out) }
}
