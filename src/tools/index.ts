import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { ToolSpec } from '../types.js'
import { applyEdit } from './edit.js'
import { addMemory } from '../memory.js'
import { Ignore, globMatcher, walk } from './ignore.js'
import { RG_BASE, ripgrep, runRg } from './rg.js'
import { fetchPage } from './web.js'

export type Preview =
  | { kind: 'diff'; path: string; before: string; after: string }
  | { kind: 'command'; command: string }
  /** Shown only in manual mode, where even read-only tools ask. */
  | { kind: 'read'; tool: string; summary: string }

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
    description: 'Read a text file. Returns lines numbered from 1 (the number and a tab come before each line; they are not part of the file). Reads up to 2000 lines; use offset and limit for longer files. Read several files at once by calling this tool more than once in the same reply.',
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
    description: 'Create a file, or overwrite one with entirely new content. Parent directories are created. For changes to an existing file prefer edit_file or multi_edit, and read the file first.',
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
    description: 'Replace an exact string in a file. old_string must match the file exactly, including indentation (copy it from read_file output without the line-number prefix), and must be unique unless replace_all is true. Include enough surrounding lines to make it unique.',
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

const relArg = (root: string, dir: string) => path.relative(root, dir).split(path.sep).join('/')

const listFiles: Tool = {
  spec: {
    name: 'list_files',
    description:
      'Find files by glob pattern, e.g. "src/**/*.ts", "*.md" or "**/test_*.py" (a pattern without "/" matches file names at any depth). Respects .gitignore. Use this instead of `find` or `ls -R`.',
    parameters: { type: 'object', properties: { pattern: str('string', 'Glob pattern'), path: str('string', 'Directory to search (default .)') } },
  },
  summarize: (a) => a.pattern || a.path || '.',
  async run(a, ctx) {
    const dir = safePath(ctx.cwd, a.path || '.')
    const root = fs.realpathSync(ctx.cwd)
    const match = a.pattern ? globMatcher(a.pattern) : () => true
    const out: string[] = []
    let files: Iterable<string>
    if (ripgrep()) {
      const rel = relArg(root, dir)
      const text = await runRg(['--files', ...RG_BASE, ...(rel ? [rel] : [])], root, ctx.signal)
      files = text.split('\n').filter(Boolean).sort(byPath)
    } else files = walk(root, dir)
    for (const rel of files) {
      if (match(rel)) out.push(rel)
      if (out.length >= 500) {
        out.push('… (truncated at 500 files; narrow the pattern or path)')
        break
      }
    }
    return out.join('\n') || '(no files)'
  },
}

type GrepMode = 'content' | 'files' | 'count'

const grep: Tool = {
  spec: {
    name: 'grep',
    description:
      'Search file contents with a regular expression (ripgrep syntax). Respects .gitignore. Use this instead of running grep or rg in bash. Modes: "content" (default) returns path:line:text, "files" returns only matching paths, "count" returns matches per file.',
    parameters: {
      type: 'object',
      properties: {
        pattern: str('string', 'Regular expression, e.g. "function\\s+\\w+" or "TODO"'),
        path: str('string', 'File or directory to search (default .)'),
        glob: str('string', 'Only files matching this glob, e.g. "*.ts" or "src/**/*.{js,jsx}"'),
        ignore_case: str('boolean', 'Case-insensitive search'),
        output_mode: { type: 'string', enum: ['content', 'files', 'count'], description: 'What to return (default content)' },
        context: str('integer', 'Lines of context around each match (content mode)'),
        multiline: str('boolean', 'Let patterns span lines (. matches newlines)'),
        max_results: str('integer', 'Most lines to return (default 200)'),
      },
      required: ['pattern'],
    },
  },
  summarize: (a) => `/${a.pattern ?? ''}/${a.glob ? ' ' + a.glob : ''}`,
  async run(a, ctx) {
    if (typeof a.pattern !== 'string' || !a.pattern) throw new Error('pattern is required.')
    const target = safePath(ctx.cwd, a.path || '.')
    const root = fs.realpathSync(ctx.cwd)
    const mode: GrepMode = a.output_mode === 'files' || a.output_mode === 'count' ? a.output_mode : 'content'
    const max = Math.min(Math.max(Number(a.max_results) || 200, 1), 2000)
    const lines = ripgrep() ? await rgSearch(a, mode, root, target, ctx.signal) : jsSearch(a, mode, root, target, max)
    if (!lines.length) return '(no matches)'
    const shown = lines.slice(0, max).map((l) => (l.length > 400 ? l.slice(0, 400) + '…' : l))
    return shown.join('\n') + (lines.length > max ? `\n… (${lines.length - max} more lines; narrow the search or raise max_results)` : '')
  },
}

async function rgSearch(a: any, mode: GrepMode, root: string, target: string, signal?: AbortSignal): Promise<string[]> {
  // --null puts a NUL after each path so paths with ":" or "-" in them still parse.
  const context = mode === 'content' ? Math.min(Math.max(Number(a.context) || 0, 0), 20) : 0
  const args = [...RG_BASE, '--color', 'never', '--null', '--with-filename']
  if (a.ignore_case) args.push('-i')
  if (a.multiline) args.push('-U', '--multiline-dotall')
  if (a.glob) args.push('--glob', String(a.glob))
  if (mode === 'files') args.push('--files-with-matches')
  else if (mode === 'count') args.push('--count-matches')
  else {
    args.push('--line-number', '--no-heading', '--max-columns', '400', '--max-columns-preview')
    if (context) args.push('-C', String(context))
  }
  args.push('-e', a.pattern)
  const rel = relArg(root, target)
  if (rel) args.push('--', rel)
  const [text, allowed] = await Promise.all([runRg(args, root, signal), a.glob ? globbedFiles(a.glob, rel, root, signal) : null])
  if (mode === 'files') return text.split('\0').map((p) => p.trim()).filter((p) => p && (!allowed || allowed.has(p))).sort(byPath)
  // rg searches files in parallel, so output arrives grouped by file but in no fixed order: sort the groups.
  const groups = new Map<string, string[]>()
  let current: string[] | undefined
  for (const line of text.split('\n')) {
    if (line === '--') {
      if (current?.length) current.push(line)
      continue
    }
    const nul = line.indexOf('\0')
    if (nul < 0) continue
    const file = line.slice(0, nul)
    if (allowed && !allowed.has(file)) {
      current = undefined
      continue
    }
    current = groups.get(file) ?? groups.set(file, []).get(file)!
    const rest = line.slice(nul + 1)
    const m = mode === 'content' ? /^(\d+)([:-])/.exec(rest) : null
    current.push(m ? `${file}${m[2]}${m[1]}${m[2]}${rest.slice(m[0].length)}` : `${file}:${rest}`)
  }
  const out: string[] = []
  for (const file of [...groups.keys()].sort(byPath)) {
    const lines = groups.get(file)!
    if (lines[lines.length - 1] === '--') lines.pop()
    // With context lines, rg separates chunks with "--"; keep that between files too.
    if (out.length && context) out.push('--')
    out.push(...lines)
  }
  return out
}

const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The files a glob covers, honouring .gitignore. rg's own --glob overrides ignore rules (so "*.ts" would
 * match ignored files), which is why grep results are checked against this list.
 */
async function globbedFiles(glob: string, rel: string, root: string, signal?: AbortSignal): Promise<Set<string>> {
  const match = globMatcher(glob)
  const text = await runRg(['--files', ...RG_BASE, ...(rel ? ['--', rel] : [])], root, signal, 50_000_000)
  return new Set(text.split('\n').filter((f) => f && match(f)))
}

/** Used when ripgrep is missing. JavaScript regex syntax; no context or multiline. */
function jsSearch(a: any, mode: GrepMode, root: string, target: string, max: number): string[] {
  let re: RegExp
  try {
    re = new RegExp(a.pattern, a.ignore_case ? 'i' : '')
  } catch (e: any) {
    throw new Error(`Invalid regex: ${e.message}`)
  }
  const match = a.glob ? globMatcher(a.glob) : () => true
  const files = fs.statSync(target).isFile() ? [relArg(root, target)] : walk(root, target)
  const out: string[] = []
  for (const rel of files) {
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
    let n = 0
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue
      n++
      if (mode === 'content') out.push(`${rel}:${i + 1}:${lines[i].slice(0, 300)}`)
      else if (mode === 'files') break
    }
    if (n && mode === 'files') out.push(rel)
    if (n && mode === 'count') out.push(`${rel}:${n}`)
    if (out.length > max) break
  }
  return out
}

const multiEdit: Tool = {
  spec: {
    name: 'multi_edit',
    description:
      'Make several exact-string replacements in one file in a single step. Edits apply in order, each to the result of the previous one, and either all succeed or none are written. Prefer this over repeated edit_file calls on the same file.',
    parameters: {
      type: 'object',
      properties: {
        path: str('string', 'File path'),
        edits: {
          type: 'array',
          description: 'Replacements to apply in order',
          items: {
            type: 'object',
            properties: { old_string: str(), new_string: str(), replace_all: str('boolean', 'Replace every occurrence') },
            required: ['old_string', 'new_string'],
          },
        },
      },
      required: ['path', 'edits'],
    },
  },
  summarize: (a) => `${a.path ?? ''}${Array.isArray(a.edits) ? ` (${a.edits.length} edits)` : ''}`,
  prepare(a, ctx) {
    const abs = safePath(ctx.cwd, a.path)
    const before = readText(abs)
    return { kind: 'diff', path: relPath(ctx.cwd, abs), before, after: applyEdits(before, a.edits) }
  },
  async run(a, ctx) {
    const abs = safePath(ctx.cwd, a.path)
    fs.writeFileSync(abs, applyEdits(readText(abs), a.edits))
    return `Edited ${relPath(ctx.cwd, abs)} (${a.edits.length} edits)`
  },
}

function applyEdits(text: string, edits: unknown): string {
  if (!Array.isArray(edits) || !edits.length) throw new Error('edits must be a non-empty array.')
  return edits.reduce((t: string, e: any, i: number) => {
    try {
      return applyEdit(t, String(e?.old_string ?? ''), String(e?.new_string ?? ''), !!e?.replace_all)
    } catch (err: any) {
      throw new Error(`Edit ${i + 1}: ${err.message} Nothing was written.`)
    }
  }, text)
}

const webFetch: Tool = {
  spec: {
    name: 'web_fetch',
    description:
      'Fetch a web page or text URL (docs, an API reference, a GitHub file, a local dev server) and return its readable text. HTML is converted to markdown-like text. Only http and https.',
    parameters: { type: 'object', properties: { url: str('string', 'Full URL, e.g. https://example.com/docs') }, required: ['url'] },
  },
  summarize: (a) => String(a.url ?? ''),
  prepare(a) {
    if (typeof a.url !== 'string' || !/^https?:\/\//i.test(a.url)) throw new Error('url must start with http:// or https://')
    return { kind: 'read', tool: 'web_fetch', summary: a.url }
  },
  async run(a, ctx) {
    return truncate(await fetchPage(String(a.url), ctx.signal))
  },
}

const TODO_MARK: Record<string, string> = { completed: '[x]', in_progress: '[~]', pending: '[ ]' }

const todoWrite: Tool = {
  spec: {
    name: 'todo_write',
    description:
      'Keep a short task list for the current work and show it to the user. Use it for tasks with three or more steps: write the plan first, keep exactly one item in_progress, and mark each item completed as soon as it is done. Each call replaces the whole list. Skip it for simple one-step requests.',
    parameters: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'The full list, in order',
          items: {
            type: 'object',
            properties: { content: str('string', 'Short imperative step, e.g. "Add a failing test"'), status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] } },
            required: ['content', 'status'],
          },
        },
      },
      required: ['todos'],
    },
  },
  summarize: (a) => {
    const t = Array.isArray(a.todos) ? a.todos : []
    const now = t.find((x: any) => x?.status === 'in_progress')?.content
    return `${t.filter((x: any) => x?.status === 'completed').length}/${t.length} done${now ? ` · ${now}` : ''}`
  },
  async run(a) {
    if (!Array.isArray(a.todos)) throw new Error('todos must be an array.')
    return a.todos.map((t: any) => `${TODO_MARK[t?.status] ?? '[ ]'} ${String(t?.content ?? '')}`).join('\n') || '(empty list)'
  },
}

const bash: Tool = {
  spec: {
    name: 'bash',
    description: 'Run a shell command in the working directory (each call starts a fresh shell there). Use it for builds, tests, git and package managers; use read_file, list_files and grep rather than cat, find or grep. Chain dependent commands with &&. Default timeout 120s (max 600000 ms); long output is truncated in the middle.',
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

/** Chat mode only: save one fact about the user to memory.md. */
export const rememberTool: Tool = {
  spec: {
    name: 'remember',
    description: 'Save one short, durable fact about the user to long-term memory so you know it in future chats.',
    parameters: { type: 'object', properties: { note: str('string', 'One short sentence, e.g. "Prefers concise answers" or "Works on a Rust game engine"') }, required: ['note'] },
  },
  summarize: (a) => String(a.note ?? '').slice(0, 120),
  async run(a) {
    return addMemory(String(a.note ?? '')) ? 'Saved.' : 'Not saved (empty or already remembered).'
  },
}

export const TOOLS: Tool[] = [readFile, writeFile, editFile, multiEdit, listFiles, grep, bash, webFetch, todoWrite]
export const toolByName = (name: string) => [...TOOLS, rememberTool].find((t) => t.spec.name === name)
export { Ignore }
