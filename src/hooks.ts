import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { configPath } from './config.js'

/**
 * Hooks: shell commands Croo runs at points in a turn, so a project can enforce its own rules.
 *
 *   PreToolUse        before a tool runs. Exit code 2 blocks the call; stderr tells the agent why.
 *   PostToolUse       after a tool ran. Exit code 2 sends stderr back to the agent (e.g. lint output).
 *   UserPromptSubmit  before a message goes to the model. stdout is added to it; exit code 2 refuses it.
 *   Stop              when the agent is about to finish. Exit code 2 sends stderr back and it keeps going.
 *
 * Each hook gets a JSON description of the event on stdin. They are read from `~/.config/croo/hooks.json`
 * and `.croo/hooks.json` in the folder, as `{ "PostToolUse": [{ "matcher": "edit_file|write_file",
 * "command": "npx prettier --write \"$CROO_FILE\"" }] }`. Claude Code's nested `{ "hooks": { ... } }` shape
 * is accepted too. A folder's hooks only run after the user has trusted that exact file.
 */

export const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'] as const
export type HookEvent = (typeof HOOK_EVENTS)[number]

export interface HookDef {
  matcher?: string
  command: string
  timeout?: number
}

export type HookSet = Partial<Record<HookEvent, HookDef[]>>

export const projectHooksFile = (cwd: string) => path.join(cwd, '.croo', 'hooks.json')
const globalHooksFile = () => path.join(path.dirname(configPath()), 'hooks.json')

/** Read a hooks file in either shape. Malformed files are treated as empty. */
export function parseHooks(text: string): HookSet {
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    return {}
  }
  if (data?.hooks && typeof data.hooks === 'object') data = data.hooks
  const out: HookSet = {}
  for (const ev of HOOK_EVENTS) {
    const list = Array.isArray(data?.[ev]) ? data[ev] : []
    const defs: HookDef[] = []
    for (const entry of list) {
      // Claude Code nests the commands: { matcher, hooks: [{ type: "command", command }] }
      const inner = Array.isArray(entry?.hooks) ? entry.hooks : [entry]
      for (const h of inner) if (typeof h?.command === 'string' && h.command.trim()) defs.push({ matcher: typeof entry?.matcher === 'string' ? entry.matcher : undefined, command: h.command, timeout: Number(h.timeout) || undefined })
    }
    if (defs.length) out[ev] = defs
  }
  return out
}

const readFile = (f: string) => {
  try {
    return fs.readFileSync(f, 'utf8')
  } catch {
    return null
  }
}

/** The folder's hooks file and a fingerprint of it, so trust is tied to exactly what the user saw. */
export function projectHooks(cwd: string): { hooks: HookSet; hash: string; commands: string[] } | null {
  const text = readFile(projectHooksFile(cwd))
  if (text === null) return null
  const hooks = parseHooks(text)
  const commands = HOOK_EVENTS.flatMap((ev) => (hooks[ev] ?? []).map((h) => `${ev}${h.matcher ? ` (${h.matcher})` : ''}: ${h.command}`))
  if (!commands.length) return null
  return { hooks, hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 16), commands }
}

export function globalHooks(): HookSet {
  const text = readFile(globalHooksFile())
  return text === null ? {} : parseHooks(text)
}

function matches(def: HookDef, tool?: string): boolean {
  if (!def.matcher || def.matcher === '*' || !tool) return true
  try {
    return new RegExp(`^(?:${def.matcher})$`).test(tool)
  } catch {
    return def.matcher === tool
  }
}

interface HookRun {
  code: number | null
  stdout: string
  stderr: string
}

function runHook(def: HookDef, cwd: string, input: object, env: Record<string, string>): Promise<HookRun> {
  return new Promise((resolve) => {
    const child = spawn(def.command, { shell: true, cwd, env: { ...process.env, CROO_PROJECT_DIR: cwd, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), Math.min(def.timeout ?? 60, 600) * 1000)
    child.on('error', (e) => (clearTimeout(timer), resolve({ code: 1, stdout, stderr: e.message })))
    child.on('close', (code) => (clearTimeout(timer), resolve({ code, stdout: stdout.slice(0, 20_000), stderr: stderr.slice(0, 20_000) })))
    child.stdin.on('error', () => {})
    child.stdin.end(JSON.stringify(input))
  })
}

export interface ToolEvent {
  tool: string
  args: Record<string, unknown>
  result?: string
}

/** Runs one folder's hooks during a turn. */
export class Hooks {
  constructor(
    private set: HookSet,
    private cwd: string,
    private sessionId: string,
  ) {}

  static merge(...sets: HookSet[]): HookSet {
    const out: HookSet = {}
    for (const s of sets) for (const ev of HOOK_EVENTS) if (s[ev]?.length) out[ev] = [...(out[ev] ?? []), ...s[ev]!]
    return out
  }

  has(ev: HookEvent) {
    return !!this.set[ev]?.length
  }

  /** Run every hook for the event; return what exit-code-2 hooks said (blocking feedback) and other stdout. */
  private async fire(ev: HookEvent, input: Record<string, unknown>, tool?: string): Promise<{ block: string; context: string }> {
    const file = typeof input.tool_input === 'object' && input.tool_input && typeof (input.tool_input as any).path === 'string' ? path.resolve(this.cwd, (input.tool_input as any).path) : ''
    const env = { CROO_HOOK_EVENT: ev, CROO_TOOL_NAME: tool ?? '', CROO_FILE: file }
    const block: string[] = []
    const context: string[] = []
    for (const def of this.set[ev] ?? []) {
      if (!matches(def, tool)) continue
      const r = await runHook(def, this.cwd, { hook_event_name: ev, session_id: this.sessionId, cwd: this.cwd, ...input }, env)
      if (r.code === 2) block.push((r.stderr || r.stdout).trim() || `Blocked by hook: ${def.command}`)
      else if (r.code === 0 && r.stdout.trim()) context.push(r.stdout.trim())
    }
    return { block: block.join('\n\n'), context: context.join('\n\n') }
  }

  /** A reason to refuse the call, or "" to let it run. */
  async preTool(e: ToolEvent): Promise<string> {
    return this.has('PreToolUse') ? (await this.fire('PreToolUse', { tool_name: e.tool, tool_input: e.args }, e.tool)).block : ''
  }

  /** Feedback to add to the tool result, or "". */
  async postTool(e: ToolEvent): Promise<string> {
    return this.has('PostToolUse') ? (await this.fire('PostToolUse', { tool_name: e.tool, tool_input: e.args, tool_response: e.result ?? '' }, e.tool)).block : ''
  }

  async promptSubmit(prompt: string): Promise<{ block: string; context: string }> {
    return this.has('UserPromptSubmit') ? this.fire('UserPromptSubmit', { prompt }) : { block: '', context: '' }
  }

  /** Why the agent should keep going, or "" to let it stop. */
  async stop(): Promise<string> {
    return this.has('Stop') ? (await this.fire('Stop', {})).block : ''
  }
}
