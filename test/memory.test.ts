import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { addMemory, clearMemory, loadMemory, removeMemory } from '../src/memory.js'
import { Permissions } from '../src/permissions.js'
import { buildChatPrompt, buildSystemPrompt } from '../src/prompt.js'

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'croo-mem-')), 'memory.md')

describe('memory', () => {
  it('saves dated notes as markdown, skips duplicates, and forgets', () => {
    const f = tmp()
    expect(addMemory('Prefers short answers', new Date('2026-10-22'), f)).toBe(true)
    expect(addMemory('prefers short answers', new Date('2026-10-23'), f)).toBe(false)
    expect(addMemory('Builds a Rust game engine', new Date('2026-10-23'), f)).toBe(true)
    expect(fs.readFileSync(f, 'utf8')).toContain('- **2026-10-22** · Prefers short answers')
    expect(loadMemory(f)).toEqual([
      { date: '2026-10-22', text: 'Prefers short answers' },
      { date: '2026-10-23', text: 'Builds a Rust game engine' },
    ])
    removeMemory(0, f)
    expect(loadMemory(f).map((e) => e.text)).toEqual(['Builds a Rust game engine'])
    clearMemory(f)
    expect(loadMemory(f)).toEqual([])
  })

  it('goes into both prompts with the name; only chat may save', () => {
    const user = { name: 'Sam', memory: [{ date: '2026-10-22', text: 'Likes terse replies' }], canRemember: true }
    const chat = buildChatPrompt(new Date(), undefined, user)
    expect(chat).toContain("The user's name is Sam")
    expect(chat).toContain('Likes terse replies')
    expect(chat).toContain('remember tool')
    const code = buildSystemPrompt(os.tmpdir(), new Date(), undefined, { ...user, canRemember: false })
    expect(code).toContain('Likes terse replies')
    expect(code).not.toContain('remember tool')
  })

  it('saving a memory never asks for approval', () => {
    expect(new Permissions('manual').needsApproval('remember')).toBe(false)
  })
})
