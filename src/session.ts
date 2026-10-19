import fs from 'node:fs'
import path from 'node:path'
import { dataDir } from './config.js'
import type { Msg } from './types.js'

export interface Session {
  id: string
  cwd: string
  profile: string
  updatedAt: string
  messages: Msg[]
}

const sessionsDir = (dir = dataDir()) => path.join(dir, 'sessions')

export function newSession(cwd: string, profile: string): Session {
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6)
  return { id, cwd, profile, updatedAt: new Date().toISOString(), messages: [] }
}

export function saveSession(s: Session, dir = dataDir()) {
  if (!s.messages.length) return
  s.updatedAt = new Date().toISOString()
  fs.mkdirSync(sessionsDir(dir), { recursive: true, mode: 0o700 })
  fs.writeFileSync(path.join(sessionsDir(dir), `${s.id}.json`), JSON.stringify(s), { mode: 0o600 })
}

/** Most recent session for this cwd, or null. */
export function loadLastSession(cwd: string, dir = dataDir()): Session | null {
  let files: string[]
  try {
    files = fs.readdirSync(sessionsDir(dir)).filter((f) => f.endsWith('.json'))
  } catch {
    return null
  }
  const sessions: Session[] = []
  for (const f of files) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(sessionsDir(dir), f), 'utf8')) as Session
      if (s.cwd === cwd && Array.isArray(s.messages)) sessions.push(s)
    } catch {}
  }
  sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return sessions[0] ?? null
}
