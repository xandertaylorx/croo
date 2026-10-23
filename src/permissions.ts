import type { PermissionMode } from './types.js'
import { isLocalUrl } from './config.js'

/** Read-only tools never change anything. */
export const READ_ONLY_TOOLS = new Set(['read_file', 'list_files', 'grep', 'todo_write', 'bash_output', 'task', 'skill'])

/** What plan mode offers: looking around, never changing anything, and propose_plan to ask for the go-ahead. */
export const PLAN_TOOLS = new Set(['read_file', 'list_files', 'grep', 'todo_write', 'bash', 'bash_output', 'web_fetch', 'browser', 'task', 'skill', 'propose_plan'])

const SAFE_BINS = new Set([
  'ls', 'pwd', 'cd', 'cat', 'head', 'tail', 'wc', 'echo', 'printf', 'grep', 'rg', 'find', 'tree', 'which', 'whoami',
  'date', 'uname', 'file', 'stat', 'du', 'df', 'sort', 'uniq', 'cut', 'diff', 'basename', 'dirname', 'realpath', 'true', 'false',
])
const SAFE_GIT = new Set(['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'blame', 'describe'])
const NODE_RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'bun'])
const NODE_SCRIPTS = new Set(['test', 'build', 'lint', 'typecheck', 'check'])

function safeSegment(seg: string): boolean {
  const w = seg.trim().split(/\s+/)
  const [bin, a, b] = w
  if (!bin) return true
  if (SAFE_BINS.has(bin)) {
    if (bin === 'find') return !w.some((x) => /^-(exec|execdir|ok|okdir|delete|fprint\w*|fls)$/.test(x))
    if (bin === 'rg' || bin === 'grep') return !w.some((x) => x.startsWith('--pre'))
    return true
  }
  if (bin === 'git') return SAFE_GIT.has(a) && !w.some((x) => x.startsWith('--output'))
  if (NODE_RUNNERS.has(bin)) return a === 'test' || (a === 'run' && NODE_SCRIPTS.has(b))
  if (bin === 'tsc') return w.includes('--noEmit')
  if (bin === 'vitest') return a === 'run' || a === undefined
  if (bin === 'pytest') return true
  if (bin === 'cargo') return ['test', 'check', 'build', 'clippy'].includes(a)
  if (bin === 'go') return ['test', 'build', 'vet'].includes(a)
  return false
}

/**
 * Auto mode runs a shell command without asking only when every part of it is a known read-only or
 * build/test command. Anything with substitution, redirection to a file, backgrounding or an unknown
 * program asks. This is deliberately conservative: when unsure, ask.
 */
export function classifyCommand(command: string): 'safe' | 'ask' {
  // Harmless redirects (2>&1, >/dev/null) are fine; any other ">" could overwrite a file.
  const cmd = command.replace(/\d?>&\d/g, '').replace(/\d?>\s*\/dev\/null/g, '').trim()
  if (!cmd || /[`>]|\$\(|<\(/.test(cmd)) return 'ask'
  if (/(^|[^&])&($|[^&])/.test(cmd)) return 'ask' // background job
  return cmd.split(/&&|\|\||;|\||\n/).every(safeSegment) ? 'safe' : 'ask'
}

export class Permissions {
  private always = new Set<string>()

  /** `extraReadOnly` says which other tools (e.g. MCP tools the server marks read-only) are safe to run unasked. */
  constructor(
    public mode: PermissionMode = 'auto',
    private extraReadOnly: (tool: string) => boolean = () => false,
  ) {}

  isReadOnly(tool: string): boolean {
    return READ_ONLY_TOOLS.has(tool) || this.extraReadOnly(tool)
  }

  /**
   * manual: everything asks, reads included.
   * auto:   reads, edits inside the folder and safe commands run; other commands and web fetches ask.
   * plan:   only read-only tools are offered (bash refuses anything unsafe); the plan itself asks.
   * bypass: nothing asks.
   */
  needsApproval(tool: string, args?: Record<string, unknown>): boolean {
    // Approving the plan is the point of propose_plan, so it always asks.
    if (tool === 'propose_plan') return true
    if (tool === 'remember' || tool === 'todo_write' || this.mode === 'bypass') return false
    if (this.mode === 'manual') return true
    if (this.isReadOnly(tool) || this.always.has(tool)) return false
    if (tool === 'bash') return this.mode !== 'plan' && classifyCommand(String(args?.command ?? '')) !== 'safe'
    if (tool === 'bash_kill') return false
    // Local pages are the user's own dev servers; anything else leaves the machine.
    if (tool === 'browser') return args?.action === 'navigate' && !isLocalUrl(String(args?.url ?? ''))
    // A request leaves the machine, and a URL can carry data out of the project: ask until allowed.
    if (tool === 'web_fetch' || tool.startsWith('mcp__')) return true
    return this.mode === 'plan' // file tools can only touch the working folder (and are not offered in plan mode)
  }

  allowAlways(tool: string) {
    this.always.add(tool)
  }
}
