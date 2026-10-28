import fs from 'node:fs'
import path from 'node:path'
import { dataDir } from './config.js'
import type { TokenCount } from './shared/ipc.js'
import type { Msg } from './types.js'

export interface Session {
  id: string
  cwd: string
  profile: string
  updatedAt: string
  title?: string
  /** `chat` is a plain conversation with no folder or tools; everything else is a coding session. */
  kind?: 'chat' | 'code'
  messages: Msg[]
  /** The conversation id of the subscription CLI (Claude Code or Codex) running this chat, to pick it up again next turn. */
  cli?: { id: string; session: string }
  /** Tokens the last request used and the model's window, for the context ring. */
  context?: { used: number; window: number }
  /** Every token the chat has used so far, for the totals under the message box. */
  usage?: TokenCount
}

/** Add one request's usage to a chat's running totals. */
export function addUsage(t: TokenCount | undefined, u: TokenCount): TokenCount {
  return {
    input: (t?.input ?? 0) + u.input,
    output: (t?.output ?? 0) + u.output,
    cacheRead: (t?.cacheRead ?? 0) + (u.cacheRead ?? 0),
    cacheWrite: (t?.cacheWrite ?? 0) + (u.cacheWrite ?? 0),
  }
}

export interface SessionMeta {
  id: string
  cwd: string
  title: string
  updatedAt: string
  kind: 'chat' | 'code'
}

const sessionsDir = (dir = dataDir()) => path.join(dir, 'sessions')
const safeId = (id: string) => /^[\w.-]+$/.test(id) && !id.includes('..')

export function newSession(cwd: string, profile: string, kind: 'chat' | 'code' = 'code'): Session {
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6)
  return { id, cwd, profile, kind, updatedAt: new Date().toISOString(), messages: [] }
}

/** A chat is named after its first message. */
export function titleFrom(messages: Msg[]): string {
  const first = messages.find((m) => m.role === 'user')
  const line = (first?.display ?? first?.content ?? '').trim().split('\n')[0]
  if (!line) return 'New chat'
  return line.length > 60 ? line.slice(0, 59) + '…' : line
}

export function saveSession(s: Session, dir = dataDir()) {
  if (!s.messages.length) return
  s.updatedAt = new Date().toISOString()
  s.title = titleFrom(s.messages)
  fs.mkdirSync(sessionsDir(dir), { recursive: true, mode: 0o700 })
  fs.writeFileSync(path.join(sessionsDir(dir), `${s.id}.json`), JSON.stringify(s), { mode: 0o600 })
}

export function loadSession(id: string, dir = dataDir()): Session | null {
  if (!safeId(id)) return null
  try {
    const s = JSON.parse(fs.readFileSync(path.join(sessionsDir(dir), `${id}.json`), 'utf8')) as Session
    return Array.isArray(s.messages) ? s : null
  } catch {
    return null
  }
}

export function deleteSession(id: string, dir = dataDir()) {
  if (!safeId(id)) return
  try {
    fs.rmSync(path.join(sessionsDir(dir), `${id}.json`), { force: true })
  } catch {}
}

/** Every saved session, newest first. Unreadable files are skipped. */
export function listSessions(dir = dataDir()): SessionMeta[] {
  let files: string[]
  try {
    files = fs.readdirSync(sessionsDir(dir)).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const out: SessionMeta[] = []
  for (const f of files) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(sessionsDir(dir), f), 'utf8')) as Session
      if (!Array.isArray(s.messages) || !s.messages.length || typeof s.cwd !== 'string') continue
      out.push({ id: s.id, cwd: s.cwd, title: s.title || titleFrom(s.messages), updatedAt: s.updatedAt, kind: s.kind === 'chat' ? 'chat' : 'code' })
    } catch {}
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
