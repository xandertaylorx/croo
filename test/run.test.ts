import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runner } from '../src/main/runner.js'
import { appendOutput, cleanShell, elapsed, runKind } from '../src/renderer/run.js'
import { parseDiff, statusLabel } from '../src/renderer/gitdiff.js'

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'])
    return true
  } catch {
    return false
  }
})()

function run(kind: 'shell' | 'python' | 'node', code: string, cwd = os.tmpdir()) {
  const runner = new Runner()
  return new Promise<{ out: string; code: number | null }>((resolve) => {
    let out = ''
    runner.start(cwd, kind, code, (_id, d) => (out += d), (e) => resolve({ out, code: e.code }))
  })
}

describe('Runner', () => {
  it('runs shell in the folder, captures stdout and stderr, and reports the exit code', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-run-'))
    const r = await run('shell', 'pwd; echo out; echo err 1>&2; exit 3', dir)
    expect(r.out).toContain(fs.realpathSync(dir))
    expect(r.out).toContain('out')
    expect(r.out).toContain('err')
    expect(r.code).toBe(3)
  })
  it('runs node scripts, including ES modules', async () => {
    expect((await run('node', 'console.log(1 + 1)')).out.trim()).toBe('2')
    expect((await run('node', 'import os from "node:os"\nconsole.log(typeof os.platform())')).out.trim()).toBe('string')
  })
  it.skipIf(!hasPython)('runs python scripts', async () => {
    const r = await run('python', 'print("ribbit")\nimport sys\nsys.exit(2)')
    expect(r.out.trim()).toBe('ribbit')
    expect(r.code).toBe(2)
  })
  it('stops a long-running command', async () => {
    const runner = new Runner()
    const t0 = Date.now()
    const done = new Promise<void>((resolve) => {
      const id = runner.start(os.tmpdir(), 'shell', 'sleep 30', () => {}, () => resolve())
      setTimeout(() => runner.stop(id), 150)
    })
    await done
    expect(Date.now() - t0).toBeLessThan(5000)
  })
})

describe('run helpers', () => {
  it('picks what is runnable', () => {
    expect(runKind('bash')).toBe('shell')
    expect(runKind('Python')).toBe('python')
    expect(runKind('js')).toBe('node')
    expect(runKind('rust')).toBeNull()
    expect(runKind('')).toBeNull()
  })
  it('strips shell prompts and sample output', () => {
    expect(cleanShell('$ npm install\n$ npm test')).toBe('npm install\nnpm test')
    expect(cleanShell('$ ls\nREADME.md\nsrc')).toBe('ls')
    expect(cleanShell('echo "$HOME"')).toBe('echo "$HOME"')
  })
  it('drops colour codes and lets carriage returns overwrite the line', () => {
    expect(appendOutput('', '\x1b[32mok\x1b[0m\n')).toBe('ok\n')
    expect(appendOutput('', 'a 10%\ra 50%\ra 100%\nnext')).toBe('a 100%\nnext')
    expect(appendOutput('', 'x'.repeat(50), 20).startsWith('… (earlier output trimmed)')).toBe(true)
  })
  it('formats durations', () => {
    expect(elapsed(120)).toBe('120ms')
    expect(elapsed(2400)).toBe('2.4s')
    expect(elapsed(125_000)).toBe('2m 5s')
  })
})

describe('parseDiff', () => {
  const diff = ['diff --git a/a.txt b/a.txt', 'index 1..2 100644', '--- a/a.txt', '+++ b/a.txt', '@@ -1,3 +1,4 @@ fn()', ' one', '-two', '+TWO', '+three', ' end', '\\ No newline at end of file', ''].join('\n')
  it('numbers lines and skips headers', () => {
    const { rows } = parseDiff(diff)
    expect(rows.map((r) => [r.type, r.no, r.text])).toEqual([
      ['hunk', undefined, 'fn()'],
      ['ctx', 1, 'one'],
      ['del', 2, 'two'],
      ['add', 2, 'TWO'],
      ['add', 3, 'three'],
      ['ctx', 4, 'end'],
    ])
  })
  it('spots binary files and labels statuses', () => {
    expect(parseDiff('Binary files a/x.png and b/x.png differ').binary).toBe(true)
    expect(statusLabel('?', '?').word).toBe('New')
    expect(statusLabel(' ', 'M').letter).toBe('M')
    expect(statusLabel('D', ' ').word).toBe('Deleted')
    expect(statusLabel('U', 'U').word).toBe('Conflict')
  })
})
