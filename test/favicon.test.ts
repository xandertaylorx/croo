import { describe, expect, it } from 'vitest'
import { iconHost } from '../src/main/favicon.js'
import { buildChatPrompt } from '../src/prompt.js'

describe('favicon hosts', () => {
  it('accepts public names and refuses addresses, localhost and odd characters', () => {
    expect(iconHost('example.com')).toBe(true)
    expect(iconHost('docs.github.com')).toBe(true)
    for (const bad of ['localhost', '127.0.0.1', '192.168.1.5', 'a.com/path', 'a b.com', 'evil.com:8080', '']) expect(iconHost(bad)).toBe(false)
  })
})

describe('chat prompt', () => {
  it('tells plain chats they can read web pages', () => {
    expect(buildChatPrompt()).toContain('web_fetch')
  })
})
