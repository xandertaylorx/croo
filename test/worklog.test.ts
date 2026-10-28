import { describe, expect, it } from 'vitest'
import { activityKind, answerStart, changedFiles, groupable, label, summarize, workedFor } from '../src/renderer/worklog.js'
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
  it('puts calls of one kind on one row, and other tools only with themselves', () => {
    expect(activityKind(tool('read_file', 'a'))).toBe(activityKind(tool('list_files', '.')))
    expect(activityKind(tool('read_file', 'a'))).not.toBe(activityKind(tool('bash', 'ls')))
    expect(activityKind(tool('mcp__gh__issue', 'x'))).toBe('other:mcp__gh__issue')
    expect(activityKind({ kind: 'thinking', text: '', done: true })).toBe('think')
  })
  it('words a row as still going while it runs', () => {
    const reads = [tool('read_file', 'a.ts'), tool('read_file', 'b.ts')] as Extract<Item, { kind: 'tool' }>[]
    expect(label('read', reads, true)).toBe('Reading 2 files')
    expect(label('read', reads)).toBe('Read 2 files')
  })
  it('splits a turn into its work and its answer', () => {
    const answer: Item = { kind: 'assistant', text: 'done' }
    const items: Item[] = [{ kind: 'assistant', text: 'looking' }, tool('read_file', 'a'), { kind: 'thinking', text: '', done: true }, answer, { kind: 'changes', files: ['a'] }]
    expect(answerStart(items)).toBe(3)
    expect(answerStart([answer])).toBe(0)
    expect(answerStart([answer, tool('bash', 'ls')])).toBe(2)
  })
  it('says how long a turn worked', () => {
    expect(workedFor(0.4)).toBe('a moment')
    expect(workedFor(12.4)).toBe('12s')
    expect(workedFor(151)).toBe('2m 31s')
    expect(workedFor(3720)).toBe('1h 2m')
  })
})
