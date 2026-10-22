import type { Attachment } from '../shared/ipc.js'

const MAX_SIDE = 1568
const KEEP_AS_IS = 1_400_000

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image.'))
    img.src = src
  })

/** Big screenshots and photos are scaled down before they are sent: faster, cheaper, and under every API's size limit. */
export async function shrinkImage(a: Attachment): Promise<Attachment> {
  if (!a.dataUrl) return a
  const img = await load(a.dataUrl)
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  const size = Math.round((a.dataUrl.length * 3) / 4)
  if (longest <= MAX_SIDE && size <= KEEP_AS_IS) return a
  const scale = Math.min(1, MAX_SIDE / longest)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  let out = canvas.toDataURL('image/png')
  let mime = 'image/png'
  if (out.length * 0.75 > KEEP_AS_IS) {
    out = canvas.toDataURL('image/jpeg', 0.86)
    mime = 'image/jpeg'
  }
  return { ...a, mime, dataUrl: out, name: mime === 'image/jpeg' ? a.name.replace(/\.\w+$/, '') + '.jpg' : a.name }
}

const readDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(f)
  })

/** Files from a paste in the message box (screenshots, copied files). Returns what could be used and what could not. */
export async function attachmentsFromFiles(files: File[]): Promise<{ attachments: Attachment[]; skipped: string[] }> {
  const attachments: Attachment[] = []
  const skipped: string[] = []
  for (const f of files) {
    const name = f.name || (f.type.startsWith('image/') ? 'pasted-image.png' : 'pasted-file')
    try {
      if (/^image\/(png|jpe?g|gif|webp)$/.test(f.type)) attachments.push({ name, kind: 'image', mime: f.type, dataUrl: await readDataUrl(f) })
      else if (f.size <= 200_000) {
        const text = await f.text()
        if (text.includes('\0')) skipped.push(name)
        else attachments.push({ name, kind: 'file', text })
      } else skipped.push(name)
    } catch {
      skipped.push(name)
    }
  }
  return { attachments, skipped }
}
