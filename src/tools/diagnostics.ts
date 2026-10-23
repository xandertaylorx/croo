import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * After the agent edits files, check them with the project's own tools and tell it about errors in the same
 * step, the way an editor shows red squiggles. Only fast checks run: the TypeScript compiler when the project
 * has one, syntax checks for JavaScript, Python, JSON and Go. A check that is missing or too slow is skipped.
 */

const TIMEOUT = 60_000
const MAX_LINES = 25

interface Run {
  code: number | null
  out: string
}

function run(cmd: string, args: string[], cwd: string, signal?: AbortSignal): Promise<Run | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: TIMEOUT, maxBuffer: 20_000_000, signal, env: process.env }, (err: any, stdout, stderr) => {
      if (err?.code === 'ENOENT' || err?.killed || err?.name === 'AbortError') return resolve(null)
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: `${stdout}${stderr}` })
    })
  })
}

const has = (p: string) => fs.existsSync(p)

/** The nearest tsconfig.json at or above `file`, inside `root`. */
function tsconfigFor(root: string, file: string): string | null {
  let dir = path.dirname(file)
  while (dir.startsWith(root)) {
    if (has(path.join(dir, 'tsconfig.json'))) return path.join(dir, 'tsconfig.json')
    if (dir === root) break
    dir = path.dirname(dir)
  }
  return null
}

/** The project's own compiler: tsgo (TypeScript 7) or tsc from node_modules. Never a global one. */
function tsCompiler(root: string): string | null {
  for (const bin of ['tsgo', 'tsc']) {
    const p = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${bin}.cmd` : bin)
    if (has(p)) return p
  }
  return null
}

const TS = /\.(ts|tsx|mts|cts)$/
/** Files some check here understands. Edits to anything else are not checked at all. */
export const CHECKABLE = /\.(ts|tsx|mts|cts|js|mjs|cjs|json|py|go)$/
const JS = /\.(js|mjs|cjs)$/

/** tsc prints "src/a.ts(3,5): error TS2322: ..." or, with --pretty false in newer versions, "src/a.ts:3:5 - error". */
const TS_LINE = /^(.+?)(?:\((\d+),(\d+)\)|:(\d+):(\d+))\s*[:-]\s*error\s+(TS\d+):\s*(.*)$/

async function typescript(root: string, files: string[], signal?: AbortSignal): Promise<string[]> {
  const tsc = tsCompiler(root)
  const configs = new Set(files.map((f) => tsconfigFor(root, f)).filter((c): c is string => !!c))
  if (!tsc || !configs.size) return []
  const wanted = new Set(files.map((f) => path.relative(root, f)))
  const out: string[] = []
  let elsewhere = 0
  for (const config of configs) {
    const r = await run(tsc, ['--noEmit', '--pretty', 'false', '-p', config], root, signal)
    if (!r || r.code === 0) continue
    const base = path.dirname(config)
    for (const line of r.out.split('\n')) {
      const m = TS_LINE.exec(line.trim())
      if (!m) continue
      const rel = path.relative(root, path.resolve(base, m[1]))
      const where = `${rel}:${m[2] ?? m[4]}:${m[3] ?? m[5]}`
      if (wanted.has(rel)) out.push(`${where} ${m[6]}: ${m[7]}`)
      else elsewhere++
    }
  }
  if (elsewhere) out.push(`(and ${elsewhere} type error${elsewhere === 1 ? '' : 's'} in other files; your change may have broken a caller. Run the type checker to see them.)`)
  return out
}

async function syntax(root: string, file: string, signal?: AbortSignal): Promise<string[]> {
  const rel = path.relative(root, file)
  if (JS.test(file)) {
    const r = await run(process.execPath, ['--check', file], root, signal)
    return r && r.code ? [`${rel}: ${firstError(r.out)}`] : []
  }
  if (/\.json$/.test(file) && !/tsconfig|jsconfig|\.vscode/.test(rel)) {
    try {
      JSON.parse(fs.readFileSync(file, 'utf8'))
      return []
    } catch (e: any) {
      return [`${rel}: invalid JSON: ${e.message}`]
    }
  }
  if (/\.py$/.test(file)) {
    const r = await run('python3', ['-c', 'import ast,sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])', file], root, signal)
    return r && r.code ? [`${rel}: ${firstError(r.out)}`] : []
  }
  if (/\.go$/.test(file)) {
    const r = await run('gofmt', ['-e', '-l', file], root, signal)
    return r && r.code ? r.out.split('\n').filter((l) => l.includes(':')).slice(0, 5).map((l) => l.replace(file, rel)) : []
  }
  return []
}

/** The useful line of a stack-style error ("SyntaxError: Unexpected token") with the line before it for context. */
function firstError(out: string): string {
  const lines = out.split('\n').map((l) => l.trimEnd())
  const i = lines.findIndex((l) => /\w*Error\b/.test(l))
  if (i < 0) return lines.filter(Boolean).slice(-1)[0] ?? 'syntax error'
  const at = lines.slice(0, i).reverse().find((l) => /:\d+/.test(l))
  return `${lines[i].trim()}${at ? ` (at ${at.trim().split(/[/\\]/).pop()})` : ''}`
}

/**
 * Check the files that were just changed. Returns a block for the tool result, or "" when nothing is wrong
 * (or nothing could be checked).
 */
export async function diagnose(cwd: string, absFiles: string[], signal?: AbortSignal): Promise<string> {
  const root = fs.realpathSync(cwd)
  const files = [...new Set(absFiles)].filter((f) => has(f))
  if (!files.length) return ''
  const problems: string[] = []
  const ts = files.filter((f) => TS.test(f))
  if (ts.length) problems.push(...(await typescript(root, ts, signal)))
  for (const f of files.filter((f) => !TS.test(f))) problems.push(...(await syntax(root, f, signal)))
  if (!problems.length) return ''
  const shown = problems.slice(0, MAX_LINES)
  const more = problems.length - shown.length
  return `\n\nDiagnostics after this change (fix these before you finish):\n${shown.join('\n')}${more > 0 ? `\n… ${more} more` : ''}`
}
