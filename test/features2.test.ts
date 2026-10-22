import { describe, expect, it } from 'vitest'
import { cleanCommitMessage, commitPrompt } from '../src/commitmsg.js'
import { chatToMarkdown, exportName } from '../src/exportmd.js'

describe('commit messages', () => {
  it('strips fences, labels, quotes and a trailing period', () => {
    expect(cleanCommitMessage('```\nAdd dark mode toggle.\n\n- adds a switch\n```')).toBe('Add dark mode toggle\n\n- adds a switch')
    expect(cleanCommitMessage('Commit message: "Fix crash on empty chat"')).toBe('Fix crash on empty chat')
    expect(cleanCommitMessage('<think>hmm</think>Update README')).toBe('Update README')
  })
  it('truncates huge diffs in the prompt', () => {
    expect(commitPrompt(['a.ts'], 'x'.repeat(50_000)).length).toBeLessThan(15_000)
  })
})

describe('chat export', () => {
  it('writes a readable markdown transcript', () => {
    const md = chatToMarkdown(
      [
        { kind: 'user', text: 'fix the bug' },
        { kind: 'tool', name: 'edit_file', summary: 'a.ts', status: 'ok' },
        { kind: 'assistant', text: 'Fixed it.' },
      ],
      { title: 'Fix bug', folder: 'app', model: 'm', date: new Date('2026-10-22') },
    )
    expect(md).toContain('# Fix bug')
    expect(md).toContain('*Exported 2026-10-22 · Folder: `app` · Model: m*')
    expect(md).toContain('## You\n\nfix the bug')
    expect(md).toContain('> **edit_file** a.ts')
    expect(md).toContain('## Croo\n\nFixed it.')
    expect(exportName('Fix: the bug!')).toBe('Fix-the-bug.md')
  })
})

import { extractTextToolCalls } from '../src/agent.js'

describe('tool calls written as text', () => {
  const names = ['bash', 'read_file']
  it('finds JSON, fenced JSON and <tool_call> forms', () => {
    expect(extractTextToolCalls('{"name":"bash","arguments":{"command":"ls"}}', names).calls[0]).toMatchObject({ name: 'bash', args: { command: 'ls' } })
    expect(extractTextToolCalls('Sure.\n```json\n{"name": "read_file", "arguments": {"path": "a.ts"}}\n```', names)).toMatchObject({ rest: 'Sure.', calls: [{ name: 'read_file' }] })
    expect(extractTextToolCalls('<tool_call>{"name":"bash","arguments":{"command":"pwd"}}</tool_call>', names).calls).toHaveLength(1)
  })
  it('ignores tools we did not offer and ordinary text', () => {
    expect(extractTextToolCalls('{"name":"delete","arguments":{"path":"."}}', names).calls).toHaveLength(0)
    expect(extractTextToolCalls('use {"a": 1} here', names).calls).toHaveLength(0)
  })
})
