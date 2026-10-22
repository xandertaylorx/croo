import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { git, gitCommit, gitDiff, gitStatus, parseStatus } from '../src/main/git.js'

const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' })

describe('parseStatus', () => {
  it('reads branch, upstream, ahead/behind, renames and untracked files', () => {
    const raw = ['## main...origin/main [ahead 2, behind 1]', ' M src/a.ts', 'A  b.txt', '?? new file.md', 'R  new.ts', 'old.ts', ''].join('\0')
    expect(parseStatus(raw)).toEqual({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
      files: [
        { path: 'src/a.ts', index: ' ', work: 'M' },
        { path: 'b.txt', index: 'A', work: ' ' },
        { path: 'new file.md', index: '?', work: '?' },
        { path: 'new.ts', index: 'R', work: ' ', orig: 'old.ts' },
      ],
    })
  })
  it('handles a repo with no commits and a detached head', () => {
    expect(parseStatus('## No commits yet on trunk\0').branch).toBe('trunk')
    expect(parseStatus('## HEAD (no branch)\0').branch).toBe('detached HEAD')
  })
})

describe('against a real repository', () => {
  let dir: string
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-git-'))
    sh(dir, 'init', '-q', '-b', 'main')
    sh(dir, 'config', 'user.email', 't@example.com')
    sh(dir, 'config', 'user.name', 'T')
    sh(dir, 'config', 'commit.gpgsign', 'false')
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\n')
    fs.writeFileSync(path.join(dir, 'b.txt'), 'keep\n')
    sh(dir, 'add', '-A')
    sh(dir, 'commit', '-q', '-m', 'init')
  })

  it('says when a folder is not a repository', async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-nogit-'))
    expect((await gitStatus(plain)).repo).toBe(false)
  })

  it('reports changes with line counts, and diffs tracked and untracked files', async () => {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'one\nTWO\nthree\n')
    fs.writeFileSync(path.join(dir, 'new.txt'), 'hello\n')
    const st = await gitStatus(dir)
    expect(st.repo).toBe(true)
    expect(st.branch).toBe('main')
    const a = st.files.find((f) => f.path === 'a.txt')!
    expect([a.work, a.add, a.del]).toEqual(['M', 2, 1])
    expect(st.files.find((f) => f.path === 'new.txt')).toMatchObject({ index: '?', work: '?' })
    expect(await gitDiff(dir, 'a.txt', false)).toContain('+TWO')
    expect(await gitDiff(dir, 'new.txt', true)).toContain('+hello')
  })

  it('commits only the selected files, even if others were staged', async () => {
    sh(dir, 'add', 'new.txt') // staged, but not selected below
    const res = await gitCommit(dir, ['a.txt'], 'change a')
    expect(res.ok).toBe(true)
    expect(sh(dir, 'show', '--name-only', '--format=%s', 'HEAD').split('\n').filter(Boolean)).toEqual(['change a', 'a.txt'])
    expect((await gitStatus(dir)).files.map((f) => f.path)).toEqual(['new.txt'])
  })

  it('refuses an empty message or selection', async () => {
    expect((await gitCommit(dir, ['new.txt'], '  ')).ok).toBe(false)
    expect((await gitCommit(dir, [], 'x')).ok).toBe(false)
    expect((await git(dir, ['rev-parse', 'HEAD'])).code).toBe(0)
  })
})

import { friendlyGitError, gitConnect, gitPush, normalizeRemote } from '../src/main/git.js'

describe('remotes and friendly errors', () => {
  it('normalizes what people type into a remote address', () => {
    expect(normalizeRemote('you/project')).toBe('https://github.com/you/project.git')
    expect(normalizeRemote('you/project.git')).toBe('https://github.com/you/project.git')
    expect(normalizeRemote('https://github.com/a/b.git')).toBe('https://github.com/a/b.git')
    expect(normalizeRemote('git@github.com:a/b.git')).toBe('git@github.com:a/b.git')
    expect(normalizeRemote('/tmp/some/bare.git')).toBe('/tmp/some/bare.git')
    expect(normalizeRemote('--upload-pack=evil')).toBeNull()
    expect(normalizeRemote('has space')).toBeNull()
    expect(normalizeRemote('')).toBeNull()
  })

  it('explains the failures people actually hit', () => {
    expect(friendlyGitError("fatal: 'origin' does not appear to be a git repository\nfatal: Could not read from remote repository.")).toMatch(/No remote/)
    expect(friendlyGitError('fatal: could not read Username for https://github.com: terminal prompts disabled')).toMatch(/sign in/)
    expect(friendlyGitError('! [rejected] main -> main (fetch first)')).toMatch(/Pull first/)
    expect(friendlyGitError("error: src refspec main does not match any")).toMatch(/Commit something/)
    expect(friendlyGitError('fatal: unable to access: Could not resolve host: github.com')).toMatch(/internet/)
    expect(friendlyGitError('all good')).toBeUndefined()
  })

  it('pushing with no remote says so instead of dumping git output', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-noremote-'))
    sh(dir, 'init', '-q', '-b', 'main')
    const res = await gitPush(dir, false)
    expect(res.ok).toBe(false)
    expect(res.hint).toMatch(/No remote/)
  })

  it('connects a remote and pushes, setting the upstream', async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-work-'))
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-bare-'))
    sh(bare, 'init', '-q', '--bare', '-b', 'main')
    sh(work, 'init', '-q', '-b', 'main')
    sh(work, 'config', 'user.email', 't@example.com')
    sh(work, 'config', 'user.name', 'T')
    sh(work, 'config', 'commit.gpgsign', 'false')
    expect((await gitConnect(work, bare)).hint).toMatch(/Commit something/) // nothing to push yet
    fs.writeFileSync(path.join(work, 'a.txt'), 'x\n')
    sh(work, 'add', '-A')
    sh(work, 'commit', '-q', '-m', 'first')
    const res = await gitConnect(work, bare)
    expect(res.ok).toBe(true)
    expect((await gitStatus(work)).upstream).toBe('origin/main')
    expect(sh(bare, 'log', '--oneline').trim()).toMatch(/first/)
    expect((await gitConnect(work, '--bad')).ok).toBe(false)
  })
})
