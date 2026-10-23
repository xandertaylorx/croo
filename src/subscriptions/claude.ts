import type { Effort } from '../effort.js'
import { FORMAT_GUIDE } from '../prompt.js'
import type { PermissionMode, ToolCall } from '../types.js'
import { findModel } from './catalog.js'
import { Log, clip, relPath, type StreamReader, type TurnSink } from './events.js'

/** Claude Code's tools, shown with the names and cards the app already has. */
const TOOL_NAMES: Record<string, string> = {
  Read: 'read_file',
  Write: 'write_file',
  Edit: 'edit_file',
  MultiEdit: 'multi_edit',
  NotebookEdit: 'edit_file',
  Bash: 'bash',
  BashOutput: 'bash_output',
  KillShell: 'bash_kill',
  Grep: 'grep',
  Glob: 'list_files',
  LS: 'list_files',
  WebFetch: 'web_fetch',
  WebSearch: 'web_search',
  Task: 'task',
  Agent: 'task',
  TodoWrite: 'todo_write',
  ExitPlanMode: 'propose_plan',
  Skill: 'skill',
}

const rel = relPath
const oneLine = (s: unknown, n = 140) => String(s ?? '').trim().split('\n')[0].slice(0, n)

/** The app's name for a Claude Code tool and the short line shown on its card. */
export function describeTool(name: string, input: Record<string, any>, cwd: string): { name: string; summary: string } {
  const mapped = TOOL_NAMES[name] ?? (name.startsWith('mcp__') ? name : name)
  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      return { name: mapped, summary: rel(cwd, input.file_path) }
    case 'NotebookEdit':
      return { name: mapped, summary: rel(cwd, input.notebook_path) }
    case 'Bash':
      return { name: mapped, summary: oneLine(input.command) }
    case 'Grep':
      return { name: mapped, summary: oneLine(input.pattern) }
    case 'Glob':
      return { name: mapped, summary: oneLine(input.pattern) }
    case 'LS':
      return { name: mapped, summary: rel(cwd, input.path) || '.' }
    case 'WebFetch':
      return { name: mapped, summary: oneLine(input.url) }
    case 'WebSearch':
      return { name: mapped, summary: oneLine(input.query) }
    case 'Task':
    case 'Agent':
      return { name: mapped, summary: oneLine(input.description ?? input.prompt) }
    case 'Skill':
      return { name: mapped, summary: oneLine(input.skill ?? input.command) }
    case 'ExitPlanMode':
      return { name: mapped, summary: 'plan' }
    case 'TodoWrite':
      return { name: mapped, summary: 'tasks' }
    default:
      return { name: mapped, summary: oneLine(input.file_path ?? input.path ?? input.command ?? input.query ?? input.url ?? JSON.stringify(input)) }
  }
}

/** The task list, in the `[x] text` lines the pinned list reads. */
const todoText = (todos: any[]) => todos.map((t) => `[${t.status === 'completed' ? 'x' : t.status === 'in_progress' ? '~' : ' '}] ${t.content ?? t.activeForm ?? ''}`).join('\n')

function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c: any) => (c?.type === 'text' ? c.text : c?.type === 'image' ? '[image]' : '')).filter(Boolean).join('\n')
  return ''
}

const SIGNED_OUT = /not logged in|please run \/login|invalid api key|authentication|oauth token|401/i

function when(sec: unknown): string {
  if (typeof sec !== 'number') return ''
  const d = new Date(sec * 1000)
  const same = d.toDateString() === new Date().toDateString()
  return `${same ? '' : d.toLocaleDateString(undefined, { weekday: 'short' }) + ' '}${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

/** Reads `claude -p --output-format stream-json --include-partial-messages` and reports it to the app. */
export class ClaudeStream implements StreamReader {
  sessionId?: string
  error?: string
  private log = new Log()
  private calls = new Map<string, { call: ToolCall; mapped: string; summary: string }>()
  private warned = false

  constructor(private sink: TurnSink, private cwd: string) {}

  feed(line: string) {
    let o: any
    try {
      o = JSON.parse(line)
    } catch {
      return
    }
    if (o.session_id) this.sessionId = o.session_id
    const sink = this.sink
    // Work a subagent does for the main agent is its own business; the Task card stands for all of it.
    if (o.parent_tool_use_id) return
    switch (o.type) {
      case 'stream_event': {
        const e = o.event
        if (e?.type === 'message_start') {
          this.log.startStep()
          sink.thinking()
        } else if (e?.type === 'content_block_delta') {
          if (e.delta?.type === 'text_delta') (sink.text(e.delta.text), this.log.addText(e.delta.text))
          else if (e.delta?.type === 'thinking_delta') sink.reasoning(e.delta.thinking)
        } else if (e?.type === 'content_block_stop' || e?.type === 'message_stop') sink.textEnd()
        return
      }
      case 'assistant': {
        const msg = o.message
        for (const b of msg?.content ?? []) {
          if (b.type !== 'tool_use') continue
          const d = describeTool(b.name, b.input ?? {}, this.cwd)
          const call: ToolCall = { id: b.id, name: d.name, args: b.input ?? {} }
          this.calls.set(b.id, { call, mapped: d.name, summary: d.summary })
          this.log.call(msg.id ?? 'm', call)
          sink.toolRunning(d.name, d.summary)
        }
        const u = msg?.usage
        if (u) sink.context((u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.output_tokens ?? 0))
        return
      }
      case 'user': {
        for (const b of o.message?.content ?? []) {
          if (b.type !== 'tool_result') continue
          const c = this.calls.get(b.tool_use_id)
          if (!c) continue
          let text = resultText(b.content)
          if (c.call.name === 'todo_write' && Array.isArray(c.call.args.todos)) text = todoText(c.call.args.todos)
          if (c.call.name === 'propose_plan' && typeof c.call.args.plan === 'string') text = c.call.args.plan
          const ok = !b.is_error
          this.log.result(c.call, clip(text), !ok)
          sink.toolDone(c.mapped, c.summary, ok, clip(text))
        }
        return
      }
      case 'rate_limit_event': {
        const r = o.rate_limit_info
        // Only worth interrupting for when the limit is close or reached.
        if (!r || this.warned || r.status === 'allowed' || (r.status !== 'rejected' && !(r.utilization >= 0.9))) return
        this.warned = true
        const week = r.rateLimitType === 'seven_day' || r.rateLimitType === 'seven_day_opus' || r.rateLimitType === 'seven_day_sonnet'
        const pct = typeof r.utilization === 'number' ? `${Math.round(r.utilization * 100)}% of ` : ''
        const blocked = r.status === 'rejected'
        sink.note(`${blocked ? 'You have hit' : 'You have used'} ${pct}your Claude ${week ? 'weekly' : r.rateLimitType === 'five_hour' ? '5-hour' : ''} limit${r.resetsAt ? `, which resets ${when(r.resetsAt)}` : ''}.`.replace(/\s+/g, ' '))
        return
      }
      case 'result': {
        const u = o.usage
        if (u) sink.usage({ input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens })
        for (const d of o.permission_denials ?? []) {
          const x = describeTool(d.tool_name, d.tool_input ?? {}, this.cwd)
          sink.note(`Claude Code was not allowed to use ${d.tool_name}${x.summary ? ` (${x.summary})` : ''} in this mode. Switch to Bypass mode, or allow it in your Claude settings.`)
        }
        if (o.is_error || (typeof o.subtype === 'string' && o.subtype.startsWith('error'))) {
          const text = String(o.result ?? o.subtype ?? 'Claude Code stopped with an error.')
          this.error = SIGNED_OUT.test(text) ? 'Claude Code is not signed in. Run `claude auth login` in a terminal, then try again.' : text
        }
        return
      }
    }
  }

  finish() {
    return this.log.finish()
  }
}

export interface ClaudeRun {
  model: string
  effort?: Effort
  mode: PermissionMode
  resume?: string
  /** A plain conversation: no file or shell tools, only the web. */
  plain?: boolean
  /** A one-off request (a commit message, a summary): no tools, nothing saved in Claude Code's history. */
  oneShot?: boolean
  userName?: string
}

/** Croo's permission modes in Claude Code's words. There is no one to ask in a headless run, so Manual allows only reading. */
export const CLAUDE_MODES: Record<PermissionMode, string> = { manual: 'default', auto: 'acceptEdits', plan: 'plan', bypass: 'bypassPermissions' }

export function claudeArgs(r: ClaudeRun): string[] {
  const model = findModel('claude-code', r.model)
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']
  if (r.model) args.push('--model', model?.id ?? r.model)
  // Only send an effort the model takes: an unknown one makes the CLI refuse to start.
  if (r.effort && r.effort !== 'auto' && model?.efforts?.includes(r.effort)) args.push('--effort', r.effort)
  if (r.oneShot) args.push('--tools', '', '--no-session-persistence', '--permission-mode', 'default')
  else if (r.plain) args.push('--tools', 'WebFetch,WebSearch', '--permission-mode', 'default')
  else args.push('--permission-mode', CLAUDE_MODES[r.mode])
  args.push('--append-system-prompt', [r.userName ? `The user's name is ${r.userName}.` : '', FORMAT_GUIDE].filter(Boolean).join('\n'))
  if (r.resume) args.push('--resume', r.resume)
  return args
}
