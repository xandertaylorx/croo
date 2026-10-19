import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyEdit } from '../src/tools/edit.js'
import { safePath, toolByName } from '../src/tools/index.js'
import { diffLines } from '../src/tools/diff.js'

describe('applyEdit', () => {
  it('replaces a unique match', () => {
    expect(applyEdit('a b c', 'b', 'X')).toBe('a X c')
  })
  it('rejects missing, ambiguous, empty and no-op edits', () => {
    expect(() => applyEdit('a', 'z', 'y')).toThrow(/not found/)
    expect(() => applyEdit('a a', 'a', 'b')).toThrow(/more than once/)
    expect(() => applyEdit('a', '', 'b')).toThrow(/empty/)
    expect(() => applyEdit('a', 'a', 'a')).toThrow(/identical/)
  })
  it('replace_all replaces every occurrence', () => {
    expect(applyEdit('a a a', 'a', 'b', true)).toBe('b b b')
  })
  it('does not interpret $ patterns in the replacement', () => {
    expect(applyEdit('x', 'x', '$&$1')).toBe('$&$1')
  })
})

describe('diffLines', () => {
  it('marks added and removed lines with numbers', () => {
    const d = diffLines('a\nb\nc', 'a\nB\nc').filter((l) => l.type !== ' ')
    expect(d).toEqual([
      { type: '-', text: 'b', oldNo: 2 },
      { type: '+', text: 'B', newNo: 2 },
    ])
  })
})

describe('file tools sandbox', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'croo-')))
  it('rejects paths outside cwd', () => {
    expect(() => safePath(dir, '../etc/passwd')).toThrow(/outside/)
    expect(() => safePath(dir, '/etc/passwd')).toThrow(/outside/)
    expect(safePath(dir, 'new/dir/file.txt')).toBe(path.join(dir, 'new/dir/file.txt'))
  })
  it('rejects symlink escapes', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-out-'))
    fs.symlinkSync(outside, path.join(dir, 'link'))
    expect(() => safePath(dir, 'link/x.txt')).toThrow(/outside/)
  })
  it('write_file then edit_file round trip', async () => {
    const ctx = { cwd: dir }
    await toolByName('write_file')!.run({ path: 'a.txt', content: 'hello world' }, ctx)
    await toolByName('edit_file')!.run({ path: 'a.txt', old_string: 'world', new_string: 'croo' }, ctx)
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('hello croo')
  })
  it('list_files and grep respect .gitignore', async () => {
    const ctx = { cwd: dir }
    fs.writeFileSync(path.join(dir, '.gitignore'), 'secret.txt\nbuild/\n')
    fs.mkdirSync(path.join(dir, 'build'))
    fs.writeFileSync(path.join(dir, 'build/out.js'), 'needle')
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'needle')
    fs.writeFileSync(path.join(dir, 'visible.txt'), 'needle')
    const list = await toolByName('list_files')!.run({}, ctx)
    expect(list).toContain('visible.txt')
    expect(list).not.toContain('secret.txt')
    expect(list).not.toContain('build/out.js')
    const found = await toolByName('grep')!.run({ pattern: 'needle' }, ctx)
    expect(found).toBe('visible.txt:1:needle')
  })
  it('bash runs, times out and reports exit codes', async () => {
    const bash = toolByName('bash')!
    expect(await bash.run({ command: 'echo hi' }, { cwd: dir })).toBe('hi')
    expect(await bash.run({ command: 'exit 3' }, { cwd: dir })).toContain('exit code 3')
    expect(await bash.run({ command: 'sleep 5', timeout_ms: 1000 }, { cwd: dir })).toContain('timed out')
  })
})
