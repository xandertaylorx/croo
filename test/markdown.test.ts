import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/renderer/markdown.js'

describe('renderMarkdown', () => {
  it('escapes html', () => {
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).not.toContain('<img')
  })
  it('renders inline code, bold and safe links only', () => {
    const html = renderMarkdown('use `a<b` and **bold** [ok](https://x.dev) [bad](javascript:alert(1))')
    expect(html).toContain('<code>a&lt;b</code>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('href="https://x.dev"')
    expect(html).not.toContain('href="javascript')
  })
  it('renders fenced code, even when the fence is not closed yet', () => {
    expect(renderMarkdown('```ts\nconst a = 1\n```')).toContain('<code>const a = 1</code>')
    expect(renderMarkdown('```ts\nconst a = 1')).toContain('<code>const a = 1</code>')
  })
  it('renders nested lists and tables', () => {
    expect(renderMarkdown('- a\n  - b\n- c')).toBe('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>')
    expect(renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('<td>2</td>')
  })
})
