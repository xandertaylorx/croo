import fs from 'node:fs'
import path from 'node:path'
import { dataDir } from './config.js'

/**
 * Checkpoints: before Croo's file tools first touch a file in a turn, the file's previous content is saved
 * (or that it did not exist). Restoring a turn puts every file it touched back. A turn is numbered by its user
 * message (0-based), so "restore to before message n" undoes turns n and later. Shell commands are not tracked.
 */
type Turns = Record<string, Record<string, string | null>>

const MAX_BYTES = 5_000_000
const dir = (base = dataDir()) => path.join(base, 'checkpoints')

export class Checkpoints {
  private turns: Turns | null = null

  constructor(
    private sessionId: string,
    private base = dataDir(),
  ) {}

  private get file() {
    return path.join(dir(this.base), `${this.sessionId}.json`)
  }

  private load(): Turns {
    if (this.turns) return this.turns
    try {
      this.turns = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Turns
    } catch {
      this.turns = {}
    }
    return this.turns
  }

  private save() {
    const turns = this.load()
    if (!Object.keys(turns).length) return void fs.rmSync(this.file, { force: true })
    fs.mkdirSync(dir(this.base), { recursive: true, mode: 0o700 })
    fs.writeFileSync(this.file, JSON.stringify(turns), { mode: 0o600 })
  }

  /** Remember what `abs` held before turn `turn` changed it. Only the first change in a turn counts. */
  record(turn: number, cwd: string, abs: string) {
    const turns = this.load()
    const rel = path.relative(fs.realpathSync(cwd), abs)
    const files = (turns[turn] ??= {})
    if (rel in files) return
    let before: string | null = null
    try {
      const st = fs.statSync(abs)
      if (!st.isFile() || st.size > MAX_BYTES) return
      before = fs.readFileSync(abs, 'utf8')
    } catch {} // did not exist: restoring deletes it
    files[rel] = before
    this.save()
  }

  /** Files changed in turn `from` and every turn after it. */
  changedFrom(from: number): string[] {
    const out = new Set<string>()
    for (const [t, files] of Object.entries(this.load())) if (Number(t) >= from) for (const rel of Object.keys(files)) out.add(rel)
    return [...out].sort()
  }

  /** Turns that changed files, for the "Restore" buttons. */
  turnsWithChanges(): number[] {
    return Object.entries(this.load())
      .filter(([, f]) => Object.keys(f).length)
      .map(([t]) => Number(t))
      .sort((a, b) => a - b)
  }

  /** Put every file touched in turn `from` and later back the way it was before turn `from`. Returns the paths. */
  restore(from: number, cwd: string): string[] {
    const turns = this.load()
    const root = fs.realpathSync(cwd)
    const original = new Map<string, string | null>()
    // The earliest turn's copy is the state before `from`.
    for (const t of Object.keys(turns).map(Number).sort((a, b) => b - a)) {
      if (t < from) continue
      for (const [rel, before] of Object.entries(turns[t])) original.set(rel, before)
      delete turns[t]
    }
    for (const [rel, before] of original) {
      const abs = path.join(root, rel)
      if (path.relative(root, abs).startsWith('..')) continue
      if (before === null) fs.rmSync(abs, { force: true })
      else {
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        fs.writeFileSync(abs, before)
      }
    }
    this.save()
    return [...original.keys()].sort()
  }

  /** Forget turn `from` and later without touching files (the conversation was cut back but the files kept). */
  drop(from: number) {
    const turns = this.load()
    for (const t of Object.keys(turns)) if (Number(t) >= from) delete turns[t]
    this.save()
  }

  remove() {
    this.turns = {}
    fs.rmSync(this.file, { force: true })
  }
}
