import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const LANGS = { bash, c, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, kotlin, markdown, php, python, ruby, rust, scss, sql, swift, typescript, xml, yaml }
for (const [name, def] of Object.entries(LANGS)) hljs.registerLanguage(name, def)

/** Names people write in fences, and file extensions, mapped to what is registered above. */
const ALIAS: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', terminal: 'bash',
  py: 'python', rb: 'ruby', rs: 'rust', kt: 'kotlin', cs: 'csharp', 'c++': 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp',
  yml: 'yaml', html: 'xml', htm: 'xml', svg: 'xml', vue: 'xml', xhtml: 'xml', plist: 'xml',
  md: 'markdown', toml: 'ini', env: 'ini', conf: 'ini', jsonc: 'json', json5: 'json', patch: 'diff', docker: 'dockerfile',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Colourised HTML for a code string. Unknown languages fall back to escaped plain text. */
export function highlight(code: string, lang: string): string {
  const key = lang.toLowerCase().trim()
  const name = ALIAS[key] ?? key
  if (!name || !hljs.getLanguage(name) || code.length > 200_000) return esc(code)
  try {
    return hljs.highlight(code, { language: name, ignoreIllegals: true }).value
  } catch {
    return esc(code)
  }
}
