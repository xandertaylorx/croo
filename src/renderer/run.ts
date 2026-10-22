import type { RunKind } from '../shared/ipc.js'

const KINDS: Record<string, RunKind> = {
  sh: 'shell', bash: 'shell', zsh: 'shell', shell: 'shell', console: 'shell', terminal: 'shell',
  py: 'python', python: 'python', python3: 'python',
  js: 'node', javascript: 'node', node: 'node', mjs: 'node',
}

/** Which snippets get a Run button: shell, Python and Node. Everything else is just code. */
export const runKind = (lang: string): RunKind | null => KINDS[lang.toLowerCase().trim()] ?? null

/**
 * Models often write terminal examples as "$ npm test". If every line starts with a prompt, drop the prompts;
 * lines of sample output that follow a prompt line (no prompt of their own) are dropped too.
 */
export function cleanShell(code: string): string {
  const lines = code.replace(/\s+$/, '').split('\n')
  const prompt = /^\s*[$%>]\s+/
  if (!lines.some((l) => prompt.test(l))) return code
  return lines
    .filter((l) => prompt.test(l))
    .map((l) => l.replace(prompt, ''))
    .join('\n')
}

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g

/**
 * Append process output the way a terminal shows it: colour codes are dropped and a lone carriage return
 * rewinds to the start of the line, so progress bars overwrite themselves instead of filling the screen.
 */
export function appendOutput(out: string, data: string, max = 120_000): string {
  let text = out
  for (const ch of data.replace(ANSI, '').replace(/\r\n/g, '\n')) {
    if (ch === '\r') text = text.slice(0, text.lastIndexOf('\n') + 1)
    else text += ch
  }
  return text.length > max ? '… (earlier output trimmed)\n' + text.slice(-max) : text
}

export function elapsed(ms: number): string {
  return ms < 950 ? `${Math.max(1, Math.round(ms))}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}
