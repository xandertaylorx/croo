import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { ToolSpec } from '../types.js'
import { applyEdit } from './edit.js'
import { Ignore, globMatcher, walk } from './ignore.js'

export type Preview =
  | { kind: 'diff'; path: string; before: string; after: string }
  | { kind: 'command'; command: string }

export interface ToolContext {
  cwd: string
  signal?: AbortSignal
}

export interface Tool {
  spec: ToolSpec
  /** Short one-line argument summary for the tool card. */
  summarize(args: any): string
  /** For tools that need approval: validate and describe the change. Throws on invalid input. */
  prepare?(args: any, ctx: ToolContext): Preview
  run(args: any, ctx: ToolContext): Promise<string>
}

export const MAX_OUTPUT = 30000
const MAX_FILE_BYTES = 1_000_000

export function truncate(s: string, max = MAX_OUTPUT): string {
  if (s.length <= max) return s
  const half = Math.floor(max / 2)
  return `${s.slice(0, half)}\n… [${s.length - max} characters truncated] …\n${s.slice(-half)}`
}

/** Resolve a path and refuse anything that escapes cwd (including via symlinks). */
export function safePath(cwd: string, p: unknown): string {
  if (typeof p !== 'string' || !p) throw new Error('path is required.')
  const root = fs.realpathSync(cwd)
  const abs = path.resolve(root, p)
  let probe = abs
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe)
    if (parent === probe) break
    probe = parent
  }
  const real = path.join(fs.realpathSync(probe), path.relative(probe, abs))
  const rel = path.relative(root, real)
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`Path "${p}" is outside the working directory.`)
  }
  return abs
}

const relPath = (cwd: string, abs: string) => path.relative(fs.realpathSync(cwd), abs) || '.'

function readText(abs: string): string {
  const stat = fs.statSync(abs)
  if (!stat.isFile()) throw new Error('Not a file.')
  if (stat.size > MAX_FILE_BYTES * 5) throw new Error('File too large.')
  const buf = fs.readFileSync(abs)
  if (buf.subarray(0, 8000).includes(0)) throw new Error('Binary file.')
  return buf.toString('utf8')
}

const str = (type = 'string', description = '') => ({ type, description })

const readFile: Tool = {
  spec: {
    name: 'read_file',
    description: 'Read a text file. Returns numbered lines. Use offset/limit for large files.',
    parameters: {
      type: 'object',
      properties: { path: str('string', 'File path relative to the working directory'), offset: str('integer', '1-based start line'), limit: str('integer', 'Max lines (default 2000)') },
      required: ['path'],
    },
  },
  summarize: (a) => a.path ?? '',
  async run(a, ctx) {
    const text = readText(safePath(ctx.cwd, a.path))
    const lines = text.split('\n')
    const start = Math.max(1, Number(a.offset) || 1)
    const limit = Math.max(1, Number(a.limit) || 2000)
    const slice = lines.slice(start - 1, start - 1 + limit)
    const out = slice.map((l, i) => `${String(start + i).padStart(5)}\t${l}`).join('\n')
    const more = start - 1 + limit < lines.length ? `\n… ${lines.length - (start - 1 + limit)} more lines` : ''
    return truncate(out + more) || '(empty file)'
  },
}

const writeFile: Tool = {
  spec: {
    name: 'write_file',
    description: 'Create or overwrite a file with the given content. Parent directories are created.',
    parameters: { type: 'object', properties: { path: str('string', 'File path'), content: str('string', 'Full file content') }, required: ['path', 'content'] },
  },
  summarize: (a) => a.path ?? '',
  prepare(a, ctx) {
    const abs = safePath(ctx.cwd, a.path)
    if (typeof a.content !== 'string') throw new Error('content is required.')
    const before = fs.existsSync(abs) ? readText(abs) : ''
    return { kind: 'diff', path: relPath(ctx.cwd, abs), before, after: a.content }
  },
  async run(a, ctx) {
    const abs = safePath(ctx.cwd, a.path)
    const existed = fs.existsSync(abs)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, a.content)
    return `${existed ? 'Overwrote' : 'Created'} ${relPath(ctx.cwd, abs)} (${a.content.split('\n').length} lines)`
  },
}

const editFile: Tool = {
  spec: {
    name: 'edit_file',
    description: 'Replace an exact string in a file. old_string must match exactly once unless replace_all is true.',
    parameters: {
      type: 'object',
      properties: { path: str(), old_string: str(), new_string: str(), replace_all: str('boolean', 'Replace every occurrence') },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  summarize: (a) => a.path ?? '',
  prepare(a, ctx) {
    const abs = safePath(ctx.cwd, a.path)
    const before = readText(abs)
    const after = applyEdit(before, String(a.old_string ?? ''), String(a.new_string ?? ''), !!a.replace_all)
    return { kind: 'diff', path: relPath(ctx.cwd, abs), before, after }
  },
  async run(a, ctx) {
    const abs = safePath(ctx.cwd, a.path)
    fs.writeFileSync(abs, applyEdit(readText(abs), a.old_string, a.new_string, !!a.replace_all))
    return `Edited ${relPath(ctx.cwd, abs)}`
  },
}

const listFiles: Tool = {
  spec: {
    name: 'list_files',
    description: 'List files (respects .gitignore). Optional glob pattern like "src/**/*.ts" or "*.md".',
    parameters: { type: 'object', properties: { pattern: str('string', 'Glob pattern'), path: str('string', 'Directory to search (default .)') } },
  },
  summarize: (a) => a.pattern || a.path || '.',
  async run(a, ctx) {
    const dir = safePath(ctx.cwd, a.path || '.')
    const root = fs.realpathSync(ctx.cwd)
    const match = a.pattern ? globMatcher(a.pattern) : () => true
    const out: string[] = []
    for (const rel of walk(root, dir)) {
      if (match(rel)) out.push(rel)
      if (out.length >= 500) {
        out.push('… (truncated at 500 files)')
        break
      }
    }
    return out.join('\n') || '(no files)'
  },
}

const grep: Tool = {
  spec: {
    name: 'grep',
    description: 'Search file contents with a regular expression (respects .gitignore). Returns path:line:text.',
    parameters: {
      type: 'object',
      properties: { pattern: str('string', 'JavaScript regular expression'), path: str('string', 'Directory (default .)'), glob: str('string', 'Only files matching this glob'), ignore_case: str('boolean') },
      required: ['pattern'],
    },
  },
  summarize: (a) => `/${a.pattern ?? ''}/${a.glob ? ' ' + a.glob : ''}`,
  async run(a, ctx) {
    let re: RegExp
    try {
      re = new RegExp(a.pattern, a.ignore_case ? 'i' : '')
    } catch (e: any) {
      throw new Error(`Invalid regex: ${e.message}`)
    }
    const dir = safePath(ctx.cwd, a.path || '.')
    const root = fs.realpathSync(ctx.cwd)
    const match = a.glob ? globMatcher(a.glob) : () => true
    const out: string[] = []
    for (const rel of walk(root, dir)) {
      if (!match(rel)) continue
      const abs = path.join(root, rel)
      let text: string
      try {
        if (fs.statSync(abs).size > MAX_FILE_BYTES) continue
        const buf = fs.readFileSync(abs)
        if (buf.subarray(0, 8000).includes(0)) continue
        text = buf.toString('utf8')
      } catch {
        continue
      }
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) out.push(`${rel}:${i + 1}:${lines[i].slice(0, 300)}`)
        if (out.length >= 200) return out.join('\n') + '\n… (truncated at 200 matches)'
      }
    }
    return out.join('\n') || '(no matches)'
  },
}

const bash: Tool = {
  spec: {
    name: 'bash',
    description: 'Run a shell command in the working directory. Default timeout 120s. Output is truncated.',
    parameters: { type: 'object', properties: { command: str(), timeout_ms: str('integer', 'Timeout in ms (max 600000)') }, required: ['command'] },
  },
  summarize: (a) => String(a.command ?? '').split('\n')[0],
  prepare(a) {
    if (typeof a.command !== 'string' || !a.command.trim()) throw new Error('command is required.')
    return { kind: 'command', command: a.command }
  },
  run(a, ctx) {
    const timeout = Math.min(Math.max(Number(a.timeout_ms) || 120_000, 1000), 600_000)
    return new Promise((resolve) => {
      const child = spawn(a.command, { shell: true, cwd: ctx.cwd, detached: process.platform !== 'win32', env: process.env })
      let out = ''
      let note = ''
      const add = (d: Buffer) => {
        if (out.length < MAX_OUTPUT * 4) out += d.toString()
      }
      child.stdout.on('data', add)
      child.stderr.on('data', add)
      const kill = () => {
        try {
          if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL')
          else child.kill('SIGKILL')
        } catch {}
      }
      const timer = setTimeout(() => {
        note = `\n[timed out after ${timeout / 1000}s]`
        kill()
      }, timeout)
      const onAbort = () => {
        note = '\n[cancelled]'
        kill()
      }
      ctx.signal?.addEventListener('abort', onAbort, { once: true })
      child.on('error', (e) => {
        clearTimeout(timer)
        resolve(`Failed to start: ${e.message}`)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        ctx.signal?.removeEventListener('abort', onAbort)
        resolve((truncate(out.trimEnd()) + note + (code ? `\n[exit code ${code}]` : '')).trim() || '(no output)')
      })
    })
  },
}

export const TOOLS: Tool[] = [readFile, writeFile, editFile, listFiles, grep, bash]
export const toolByName = (name: string) => TOOLS.find((t) => t.spec.name === name)
export { Ignore }
