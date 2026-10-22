import fs from 'node:fs'
import path from 'node:path'
import { dataDir } from './config.js'

/** One remembered fact and the day it was added. */
export interface MemoryEntry {
  date: string
  text: string
}

const HEADER = '# Croo memory\n\nThings Croo remembers about you. Edit freely: each line is `- **date** · note`.\n\n'
const LINE = /^- \*\*(\d{4}-\d{2}-\d{2})\*\* · (.+)$/

export const memoryPath = (dir = dataDir()) => path.join(dir, 'memory.md')

export function loadMemory(file = memoryPath()): MemoryEntry[] {
  let raw = ''
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  return raw.split('\n').flatMap((l) => {
    const m = LINE.exec(l.trim())
    return m ? [{ date: m[1], text: m[2] }] : []
  })
}

function write(entries: MemoryEntry[], file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, HEADER + entries.map((e) => `- **${e.date}** · ${e.text}`).join('\n') + (entries.length ? '\n' : ''))
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 300)

/** Adds a note unless it is empty or already there. Returns false when nothing was added. */
export function addMemory(text: string, now = new Date(), file = memoryPath()): boolean {
  const t = clean(String(text ?? ''))
  if (!t) return false
  const all = loadMemory(file)
  if (all.some((e) => e.text.toLowerCase() === t.toLowerCase())) return false
  write([...all, { date: now.toISOString().slice(0, 10), text: t }], file)
  return true
}

export function removeMemory(index: number, file = memoryPath()) {
  const all = loadMemory(file)
  if (index >= 0 && index < all.length) write(all.filter((_, i) => i !== index), file)
}

export function clearMemory(file = memoryPath()) {
  fs.rmSync(file, { force: true })
}

/** The memory as the model sees it. */
export function memoryBlock(entries: MemoryEntry[]): string {
  if (!entries.length) return ''
  return `What you remember about the user (saved from earlier chats; use it naturally, don't recite it):\n${entries.map((e) => `- ${e.text} (${e.date})`).join('\n')}`
}
