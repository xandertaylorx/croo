import fs from 'node:fs'
import path from 'node:path'
import type { Attachment } from '../shared/ipc.js'

const IMAGE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
const MAX_IMAGE = 12_000_000
const MAX_TEXT = 200_000

/** Read dropped or picked files. Images become data URLs, text files their contents; anything else is reported as skipped. */
export function readAttachments(paths: string[]): { attachments: Attachment[]; skipped: string[] } {
  const attachments: Attachment[] = []
  const skipped: string[] = []
  for (const p of paths) {
    const name = path.basename(p)
    try {
      const stat = fs.statSync(p)
      if (!stat.isFile()) {
        skipped.push(name)
        continue
      }
      const mime = IMAGE[path.extname(p).slice(1).toLowerCase()]
      if (mime) {
        if (stat.size > MAX_IMAGE) skipped.push(name)
        else attachments.push({ name, kind: 'image', mime, dataUrl: `data:${mime};base64,${fs.readFileSync(p).toString('base64')}` })
        continue
      }
      if (stat.size > MAX_TEXT) {
        skipped.push(name)
        continue
      }
      const buf = fs.readFileSync(p)
      if (buf.subarray(0, 8000).includes(0)) skipped.push(name)
      else attachments.push({ name, kind: 'file', text: buf.toString('utf8') })
    } catch {
      skipped.push(name)
    }
  }
  return { attachments, skipped }
}
