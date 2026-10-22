import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { costOf, formatCost, priceFor } from '../src/pricing.js'
import { compareVersions, pickAsset } from '../src/version.js'
import { expandMentions, scorePath, searchFiles } from '../src/mentions.js'
import { searchChats } from '../src/chatsearch.js'
import { newSession, saveSession, loadSession, listSessions } from '../src/session.js'
import { rewindTo, toItems } from '../src/transcript.js'
import { toAnthropicMessages } from '../src/providers/anthropic.js'
import { toOpenAIMessages } from '../src/providers/openai.js'
import { toGeminiContents } from '../src/providers/gemini.js'
import type { Msg } from '../src/types.js'

const tmp = (p: string) => fs.mkdtempSync(path.join(os.tmpdir(), p))

describe('pricing', () => {
  it('knows Claude prices, local servers are free, others are unknown until you set them', () => {
    expect(priceFor({ type: 'anthropic', model: 'claude-opus-5-5' })).toMatchObject({ input: 4, output: 20, source: 'built-in' })
    expect(priceFor({ type: 'anthropic', model: 'claude-sonnet-4-6' })).toMatchObject({ input: 3, output: 15 })
    expect(priceFor({ type: 'anthropic', model: 'claude-haiku-4-5' })).toMatchObject({ input: 1, output: 5 })
    expect(priceFor({ type: 'openai', model: 'llama3', baseUrl: 'http://localhost:11434/v1' })).toMatchObject({ input: 0, source: 'local' })
    expect(priceFor({ type: 'openai', model: 'gpt-4o' })).toBeNull()
    expect(priceFor({ type: 'openai', model: 'gpt-4o', inputPerMTok: 2.5, outputPerMTok: 10 })).toMatchObject({ input: 2.5, output: 10, source: 'custom' })
  })
  it('turns tokens into dollars and formats them', () => {
    expect(costOf({ input: 1_000_000, output: 100_000 }, { input: 4, output: 20 })).toBeCloseTo(6)
    expect(formatCost(0)).toBe('$0')
    expect(formatCost(0.004)).toBe('<$0.01')
    expect(formatCost(0.124)).toBe('$0.12')
    expect(formatCost(3.456)).toBe('$3.46')
    expect(formatCost(42.3)).toBe('$42.3')
  })
})

describe('versions', () => {
  it('compares versions', () => {
    expect(compareVersions('0.7.0', '0.6.0')).toBeGreaterThan(0)
    expect(compareVersions('v0.6.0', '0.6.0')).toBe(0)
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
  })
  it('picks the installer for this machine', () => {
    const assets = [
      { name: 'Croo-0.7.0-arm64.dmg', browser_download_url: 'a' },
      { name: 'Croo-0.7.0.dmg', browser_download_url: 'b' },
      { name: 'Croo-0.7.0-mac.zip', browser_download_url: 'c' },
    ]
    expect(pickAsset(assets, 'darwin', 'arm64')?.browser_download_url).toBe('a')
    expect(pickAsset(assets, 'darwin', 'x64')?.browser_download_url).toBe('b')
    expect(pickAsset(assets, 'win32', 'x64')).toBeUndefined()
  })
})

describe('@mentions and file search', () => {
  const dir = tmp('croo-mention-')
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'src', 'app.ts'), 'export const a = 1\n')
  fs.writeFileSync(path.join(dir, 'README.md'), '# hi\n')
  fs.writeFileSync(path.join(dir, 'blob.bin'), Buffer.from([0, 1, 2, 3]))
  fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored.txt\n')
  fs.writeFileSync(path.join(dir, 'ignored.txt'), 'x')

  it('reads mentioned text files and skips the rest', () => {
    const got = expandMentions('please look at @src/app.ts and @README.md, plus @blob.bin @nope.ts @../etc/passwd', dir)
    expect(got.map((f) => f.name)).toEqual(['src/app.ts', 'README.md'])
    expect(got[0].text).toContain('export const a')
    expect(expandMentions('email me@example.com', dir)).toEqual([])
  })
  it('ranks matches and respects .gitignore', () => {
    expect(scorePath('src/app.ts', 'app')).toBeGreaterThan(scorePath('src/application/readme.ts', 'app') - 1)
    expect(scorePath('src/app.ts', 'zzz')).toBe(0)
    expect(searchFiles(dir, 'app')[0]).toBe('src/app.ts')
    expect(searchFiles(dir, '')).not.toContain('ignored.txt')
    expect(searchFiles(dir, 'ignored')).toEqual([])
  })
})

describe('chat search', () => {
  it('finds chats by title and by what was said', () => {
    const data = tmp('croo-search-')
    const a = newSession('/p', 'x')
    a.messages.push({ role: 'user', content: 'fix the login bug' }, { role: 'assistant', content: 'The cause is a stale cookie in the session store.' })
    const b = newSession('/p', 'x', 'chat')
    b.messages.push({ role: 'user', content: 'recipe ideas' }, { role: 'assistant', content: 'Try shakshuka.' })
    saveSession(a, data)
    saveSession(b, data)
    const metas = listSessions(data)
    const load = (id: string) => loadSession(id, data)
    expect(searchChats(metas, 'login', load).map((h) => h.title)).toEqual(['fix the login bug'])
    const body = searchChats(metas, 'cookie', load)
    expect(body).toHaveLength(1)
    expect(body[0].snippet).toContain('stale cookie')
    expect(searchChats(metas, 'shakshuka', load)[0]).toMatchObject({ kind: 'chat' })
    expect(searchChats(metas, 'nothing here', load)).toEqual([])
    expect(searchChats(metas, '', load)).toHaveLength(2)
  })
})

describe('edit and retry', () => {
  const msgs = (): Msg[] => [
    { role: 'user', content: 'one' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'two', display: 'two (typed)' },
    { role: 'assistant', content: 'a2', toolCalls: [{ id: 't', name: 'bash', args: {} }] },
    { role: 'tool', toolCallId: 't', name: 'bash', content: 'ok' },
    { role: 'assistant', content: 'a3' },
  ]
  it('cuts the conversation back to before a user message and returns it', () => {
    const m = msgs()
    const got = rewindTo(m, 1)
    expect(got).toMatchObject({ content: 'two', display: 'two (typed)' })
    expect(m).toHaveLength(2)
    expect(rewindTo(m, 5)).toBeNull()
    expect(rewindTo(msgs(), 0)).toMatchObject({ content: 'one' })
  })
})

describe('attachments', () => {
  const user: Msg = { role: 'user', content: 'what is this?', images: [{ name: 'a.png', mime: 'image/png', data: 'QUJD' }], attached: [{ name: 'n.txt', text: 'hi' }] }
  it('shows them in the transcript', () => {
    const [item] = toItems([user])
    expect(item).toMatchObject({ kind: 'user', attachments: [{ kind: 'image', name: 'a.png', dataUrl: 'data:image/png;base64,QUJD' }, { kind: 'file', name: 'n.txt' }] })
  })
  it('sends images to each provider in its own shape', () => {
    expect(toAnthropicMessages([user])[0].content).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } }, { type: 'text', text: 'what is this?' }])
    expect(toOpenAIMessages('s', [user])[1].content).toEqual([{ type: 'text', text: 'what is this?' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } }])
    expect(toGeminiContents([user])[0].parts).toEqual([{ text: 'what is this?' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }])
    expect(toOpenAIMessages('s', [{ role: 'user', content: 'plain' }])[1].content).toBe('plain')
  })
})
