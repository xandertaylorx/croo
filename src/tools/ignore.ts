import fs from 'node:fs'
import path from 'node:path'

interface Rule {
  re: RegExp
  negate: boolean
  dirOnly: boolean
}

export function globToRegexSource(glob: string): string {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:.*/)?'
          i += 2
        } else {
          out += '.*'
          i += 1
        }
      } else out += '[^/]*'
    } else if (c === '?') out += '[^/]'
    else if (c === '{') {
      const end = glob.indexOf('}', i)
      if (end > i) {
        out += '(?:' + glob.slice(i + 1, end).split(',').map(globToRegexSource).join('|') + ')'
        i = end
      } else out += '\\{'
    } else out += c.replace(/[.+^$()|[\]\\]/g, '\\$&')
  }
  return out
}

/** Match a glob against a relative posix path. Patterns without "/" match the basename anywhere. */
export function globMatcher(pattern: string): (rel: string) => boolean {
  const re = new RegExp('^' + (pattern.includes('/') ? '' : '(?:.*/)?') + globToRegexSource(pattern.replace(/^\.\//, '')) + '$')
  return (rel) => re.test(rel)
}

export function parseIgnore(text: string): Rule[] {
  const rules: Rule[] = []
  for (let line of text.split('\n')) {
    line = line.replace(/\r$/, '').replace(/(?<!\\)\s+$/, '')
    if (!line || line.startsWith('#')) continue
    const negate = line.startsWith('!')
    if (negate) line = line.slice(1)
    const dirOnly = line.endsWith('/')
    if (dirOnly) line = line.slice(0, -1)
    const anchored = line.startsWith('/') || line.includes('/')
    line = line.replace(/^\//, '')
    const re = new RegExp('^' + (anchored ? '' : '(?:.*/)?') + globToRegexSource(line) + '(?:/.*)?$')
    rules.push({ re, negate, dirOnly })
  }
  return rules
}

export class Ignore {
  private layers: { base: string; rules: Rule[] }[] = []

  addDir(absDir: string, root: string) {
    try {
      const text = fs.readFileSync(path.join(absDir, '.gitignore'), 'utf8')
      this.layers.push({ base: path.relative(root, absDir).split(path.sep).join('/'), rules: parseIgnore(text) })
    } catch {}
  }

  /** rel: posix path relative to root. */
  ignored(rel: string, isDir: boolean): boolean {
    let result = false
    for (const { base, rules } of this.layers) {
      if (base && !rel.startsWith(base + '/')) continue
      const sub = base ? rel.slice(base.length + 1) : rel
      for (const r of rules) {
        // dir-only rules match the directory itself or anything beneath it
        if (r.dirOnly && !isDir && !r.re.test(sub.split('/').slice(0, -1).join('/'))) continue
        if (r.re.test(sub)) result = !r.negate
      }
    }
    return result
  }
}

const ALWAYS_SKIP = new Set(['.git', 'node_modules'])

/** Walk files under dir (absolute), respecting .gitignore. Yields posix paths relative to root. */
export function* walk(root: string, dir: string, ig = new Ignore(), limit = { n: 20000 }): Generator<string> {
  ig.addDir(dir, root)
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const e of entries) {
    if (limit.n <= 0) return
    if (ALWAYS_SKIP.has(e.name)) continue
    const abs = path.join(dir, e.name)
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (e.isDirectory()) {
      if (ig.ignored(rel, true)) continue
      yield* walk(root, abs, ig, limit)
    } else if (e.isFile()) {
      if (ig.ignored(rel, false)) continue
      limit.n--
      yield rel
    }
  }
}
