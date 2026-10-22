import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readAttachments } from '../src/main/attachments.js'

describe('readAttachments', () => {
  it('turns images into data URLs, reads text, and reports what it skipped', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-att-'))
    fs.writeFileSync(path.join(dir, 'a.png'), Buffer.from([137, 80, 78, 71]))
    fs.writeFileSync(path.join(dir, 'n.txt'), 'hello')
    fs.writeFileSync(path.join(dir, 'b.bin'), Buffer.from([0, 1, 2]))
    fs.writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(300_000))
    fs.mkdirSync(path.join(dir, 'sub'))
    const r = readAttachments(['a.png', 'n.txt', 'b.bin', 'big.txt', 'sub', 'missing.txt'].map((f) => path.join(dir, f)))
    expect(r.attachments).toEqual([
      { name: 'a.png', kind: 'image', mime: 'image/png', dataUrl: 'data:image/png;base64,iVBORw==' },
      { name: 'n.txt', kind: 'file', text: 'hello' },
    ])
    expect(r.skipped).toEqual(['b.bin', 'big.txt', 'sub', 'missing.txt'])
  })
})
