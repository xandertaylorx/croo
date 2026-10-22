import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../src/renderer/markdown.js'
import { highlightLines } from '../src/renderer/highlight.js'

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
    expect(renderMarkdown('```ts\nconst a = 1\n```')).toContain('hljs-keyword')
    expect(renderMarkdown('```ts\nconst a = 1')).toContain('hljs-number')
  })
  it('renders nested lists and tables', () => {
    expect(renderMarkdown('- a\n  - b\n- c')).toBe('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>')
    expect(renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('<td>2</td>')
  })
})

describe('richer markdown', () => {
  it('renders task lists and turns bare URLs into links', () => {
    const html = renderMarkdown('- [x] done\n- [ ] todo')
    expect(html).toContain('<li class="task done">')
    expect(html).toContain('<li class="task">')
    expect(renderMarkdown('see https://example.com/a?b=1, ok')).toContain('<a href="https://example.com/a?b=1"')
    expect(renderMarkdown('[text](https://example.com)')).toBe('<p><a href="https://example.com" target="_blank" rel="noreferrer">text</a></p>')
  })
})

describe('highlightLines', () => {
  it('splits into lines with balanced tags, even across a block comment', () => {
    const lines = highlightLines('/* one\ntwo */\nconst a = 1', 'ts')
    expect(lines).toHaveLength(3)
    for (const l of lines) expect((l.match(/<span/g) ?? []).length).toBe((l.match(/<\/span>/g) ?? []).length)
    expect(lines[1]).toContain('hljs-comment')
    expect(lines[2]).toContain('hljs-keyword')
  })
  it('escapes unknown languages and keeps empty lines', () => {
    expect(highlightLines('a < b\n\nc', 'nope')).toEqual(['a &lt; b', '', 'c'])
  })
})
