import { describe, expect, it } from 'vitest'
import { changedFiles, groupable, summarize } from '../src/renderer/worklog.js'
import type { Item } from '../src/shared/ipc.js'

const tool = (name: string, summary: string, status: 'ok' | 'error' | 'running' = 'ok'): Item => ({ kind: 'tool', name, summary, status })

describe('work log', () => {
  it('summarizes a run by its two most important kinds of work', () => {
    const items = [tool('read_file', 'a.ts'), tool('read_file', 'b.ts'), tool('edit_file', 'a.ts'), tool('edit_file', 'a.ts'), tool('bash', 'npm test'), tool('grep', 'foo')]
    expect(summarize(items).text).toBe('Edited 1 file, ran 1 command, and 3 other actions')
  })
  it('uses plain wording for small runs', () => {
    expect(summarize([tool('read_file', 'a.ts'), tool('read_file', 'b.ts')]).text).toBe('Read 2 files')
    expect(summarize([tool('edit_file', 'a.ts'), tool('bash', 'ls')]).text).toBe('Edited 1 file and ran 1 command')
  })
  it('counts failures and ignores the task list', () => {
    const r = summarize([tool('bash', 'x', 'error'), tool('bash', 'y'), tool('todo_write', 'plan')])
    expect(r).toEqual({ text: 'Ran 2 commands', failed: 1 })
  })
  it('lists changed files once, most recent last, only if they succeeded', () => {
    const items = [tool('edit_file', 'a.ts'), tool('write_file', 'b.ts'), tool('edit_file', 'a.ts'), tool('edit_file', 'c.ts', 'error'), tool('bash', 'ls')]
    expect(changedFiles(items)).toEqual(['b.ts', 'a.ts'])
  })
  it('groups tool calls and reasoning, but not messages', () => {
    expect(groupable(tool('bash', 'ls'))).toBe(true)
    expect(groupable({ kind: 'thinking', text: '', done: true })).toBe(true)
    expect(groupable({ kind: 'assistant', text: 'hi' })).toBe(false)
    expect(groupable({ kind: 'error', text: 'x' })).toBe(false)
  })
})
