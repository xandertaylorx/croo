import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deleteSession, listSessions, loadSession, newSession, saveSession } from '../src/session.js'
import { toItems } from '../src/transcript.js'
import { loadWorkspaces, saveWorkspaces } from '../src/workspaces.js'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'croo-'))

describe('sessions', () => {
  it('saves, lists, loads and deletes chats, titled by the first message', () => {
    const dir = tmp()
    const s = newSession('/work/a', 'p')
    saveSession(s, dir)
    expect(listSessions(dir)).toEqual([]) // empty chats are not saved
    s.messages.push({ role: 'user', content: 'fix the bug\nplease' })
    saveSession(s, dir)
    expect(listSessions(dir)).toMatchObject([{ id: s.id, cwd: '/work/a', title: 'fix the bug' }])
    expect(loadSession(s.id, dir)?.messages).toHaveLength(1)
    expect(loadSession('../etc/passwd', dir)).toBeNull()
    deleteSession(s.id, dir)
    expect(listSessions(dir)).toEqual([])
  })
  it('remembers workspaces', () => {
    const dir = tmp()
    expect(loadWorkspaces(dir)).toEqual([])
    saveWorkspaces(['/a', '/b'], dir)
    expect(loadWorkspaces(dir)).toEqual(['/a', '/b'])
  })
})

describe('toItems', () => {
  it('pairs tool calls with their results and marks denials', () => {
    const items = toItems([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'ok', toolCalls: [{ id: '1', name: 'read_file', args: { path: 'a.ts' } }, { id: '2', name: 'bash', args: { command: 'ls' } }] },
      { role: 'tool', toolCallId: '1', name: 'read_file', content: 'text' },
      { role: 'tool', toolCallId: '2', name: 'bash', content: 'The user denied this action.', isError: true },
    ])
    expect(items.map((i) => i.kind)).toEqual(['user', 'assistant', 'tool', 'tool'])
    expect(items[2]).toMatchObject({ summary: 'a.ts', status: 'ok' })
    expect(items[3]).toMatchObject({ status: 'denied' })
  })
})
