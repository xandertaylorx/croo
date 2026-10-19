import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConfig, resolveApiKey, saveConfig, defaultConfig } from '../src/config.js'

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'croo-cfg-')), 'croo', 'config.json')

describe('config', () => {
  it('returns null when missing', () => {
    expect(loadConfig(tmp())).toBeNull()
  })
  it('saves with mode 600 and round-trips', () => {
    const f = tmp()
    saveConfig({ ...defaultConfig(), activeProfile: 'a', profiles: { a: { type: 'openai', model: 'm' } } }, f)
    expect(fs.statSync(f).mode & 0o777).toBe(0o600)
    const cfg = loadConfig(f)!
    expect(cfg.activeProfile).toBe('a')
    expect(cfg.pet).toBe(true)
  })
  it('falls back to the first profile and rejects bad profiles', () => {
    const f = tmp()
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, JSON.stringify({ activeProfile: 'gone', profiles: { x: { type: 'gemini', model: 'g' } } }))
    expect(loadConfig(f)!.activeProfile).toBe('x')
    fs.writeFileSync(f, JSON.stringify({ profiles: { x: { type: 'nope' } } }))
    expect(() => loadConfig(f)).toThrow(/valid/)
    fs.writeFileSync(f, '{oops')
    expect(() => loadConfig(f)).toThrow(/JSON/)
  })
  it('resolves keys: config, CROO_API_KEY, then provider env', () => {
    const p = { type: 'anthropic' as const, model: 'm' }
    expect(resolveApiKey({ ...p, apiKey: 'cfg' }, { CROO_API_KEY: 'c', ANTHROPIC_API_KEY: 'a' })).toBe('cfg')
    expect(resolveApiKey(p, { CROO_API_KEY: 'c', ANTHROPIC_API_KEY: 'a' })).toBe('c')
    expect(resolveApiKey(p, { ANTHROPIC_API_KEY: 'a' })).toBe('a')
    expect(resolveApiKey(p, {})).toBeUndefined()
  })
})
