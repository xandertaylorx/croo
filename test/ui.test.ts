import { describe, expect, it } from 'vitest'
import { frogPet } from '../src/ui/pet.js'
import { createTheme, detectColorLevel, visibleLength } from '../src/ui/theme.js'
import { MarkdownStream } from '../src/ui/markdown.js'

describe('pet frames', () => {
  for (const [state, frames] of Object.entries(frogPet.frames)) {
    it(`${state}: 2-4 frames, equal width, <= 4 lines`, () => {
      expect(frames.length).toBeGreaterThanOrEqual(2)
      expect(frames.length).toBeLessThanOrEqual(4 + (state === 'thinking' ? 0 : 0))
      const width = visibleLength(frames[0][0])
      for (const f of frames) {
        expect(f.length).toBeLessThanOrEqual(4)
        for (const l of f) expect(visibleLength(l)).toBe(width)
      }
    })
  }
  it('matches the idle snapshot', () => {
    expect(frogPet.frames.idle[0].join('\n')).toMatchInlineSnapshot(`
      " ▄▄▄   ▄▄▄ 
      ██▄█▄▄▄█▄██
      ▀█▄▀▀▀▀▀▄█▀
       ▀▀     ▀▀ "
    `)
  })
})

describe('theme', () => {
  it('NO_COLOR disables colour', () => {
    const level = detectColorLevel({ NO_COLOR: '1', COLORTERM: 'truecolor' }, true)
    expect(level).toBe(0)
    const t = createTheme(level)
    expect(t.accent('x')).toBe('x')
    expect(t.bold('x')).toBe('x')
  })
  it('non-TTY disables colour; TTY picks the best level', () => {
    expect(detectColorLevel({ COLORTERM: 'truecolor' }, false)).toBe(0)
    expect(detectColorLevel({ COLORTERM: 'truecolor' }, true)).toBe(3)
    expect(detectColorLevel({ TERM: 'xterm-256color' }, true)).toBe(2)
    expect(detectColorLevel({ TERM: 'xterm' }, true)).toBe(1)
  })
  it('falls back to 256 and 16 colour escapes', () => {
    expect(createTheme(3).accent('x')).toContain('38;2;')
    expect(createTheme(2).accent('x')).toContain('38;5;')
    expect(createTheme(1).accent('x')).toMatch(/^\x1b\[\d+mx/)
  })
})

describe('markdown', () => {
  it('passes text through untouched without colour', () => {
    let out = ''
    const md = new MarkdownStream(createTheme(0), (s) => (out += s))
    md.push('# Hi\n- **a** `b`\n')
    md.flush()
    expect(out).toBe('# Hi\n- **a** `b`\n')
  })
  it('renders lists, code and bold with colour, across chunk boundaries', () => {
    let out = ''
    const md = new MarkdownStream(createTheme(3), (s) => (out += s))
    md.push('- **bo')
    md.push('ld**\n```ts\nlet x\n```\n')
    md.flush()
    expect(out).toContain('•')
    expect(out).toContain('\x1b[1mbold')
    expect(out).toContain('let x')
    expect(out).not.toContain('```')
  })
})
