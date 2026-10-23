import type { Effort } from '../effort.js'
import type { PermissionMode, ToolCall } from '../types.js'
import { findModel } from './catalog.js'
import { Log, clip, relPath, type StreamReader, type TurnSink } from './events.js'

const oneLine = (s: unknown, n = 140) => String(s ?? '').trim().split('\n')[0].slice(0, n)
const rel = relPath

/** `bash -lc "npm test"` is just `npm test` to a reader. */
export const unwrapShell = (cmd: string) => {
  const m = /^(?:\/\S+\/)?(?:ba|z|da)?sh\s+-l?c\s+(['"])([\s\S]*)\1$/.exec(cmd.trim())
  return m ? m[2] : cmd
}

/**
 * Reads `codex exec --json`. Codex writes each finished step as one event, so its messages between commands
 * arrive whole: the chat shows them as updates between the work, exactly as they were written.
 */
export class CodexStream implements StreamReader {
  sessionId?: string
  error?: string
  private log = new Log()
  private n = 0
  private open = new Map<string, { call: ToolCall; mapped: string; summary: string }>()

  constructor(private sink: TurnSink, private cwd: string) {}

  /** A tool card for a finished item: shown running and done in one go when there was no start event. */
  private card(id: string, name: string, summary: string, args: Record<string, any>) {
    const existing = this.open.get(id)
    if (existing) return existing
    const call: ToolCall = { id, name, args }
    const entry = { call, mapped: name, summary }
    this.open.set(id, entry)
    this.log.call(`codex-${this.n}`, call)
    this.sink.toolRunning(name, summary)
    return entry
  }

  private done(id: string, ok: boolean, result: string) {
    const e = this.open.get(id)
    if (!e) return
    this.open.delete(id)
    this.log.result(e.call, clip(result), !ok)
    this.sink.toolDone(e.mapped, e.summary, ok, clip(result))
  }

  feed(line: string) {
    let o: any
    try {
      o = JSON.parse(line)
    } catch {
      return
    }
    const sink = this.sink
    switch (o.type) {
      case 'thread.started':
        this.sessionId = o.thread_id
        return
      case 'turn.started':
        sink.thinking()
        return
      case 'item.started':
      case 'item.updated':
      case 'item.completed': {
        const it = o.item
        if (!it) return
        const finished = o.type === 'item.completed'
        switch (it.type) {
          case 'agent_message':
            if (finished && it.text) {
              this.log.startStep()
              sink.text(it.text)
              sink.textEnd()
              this.log.addText(it.text)
              this.log.startStep()
              sink.thinking()
            }
            return
          case 'reasoning':
            if (finished && it.text) (sink.reasoning(it.text), sink.textEnd())
            return
          case 'command_execution': {
            const cmd = unwrapShell(it.command ?? '')
            this.card(it.id, 'bash', oneLine(cmd), { command: cmd })
            if (finished || it.status === 'completed' || it.status === 'failed') this.done(it.id, it.status !== 'failed' && (it.exit_code ?? 0) === 0, String(it.aggregated_output ?? '') || (it.exit_code ? `Exited with code ${it.exit_code}.` : ''))
            return
          }
          case 'file_change': {
            const changes: { path: string; kind: string }[] = it.changes ?? []
            if (!finished) return
            // One card per file so the changed-files list and the summary count each of them.
            changes.forEach((c, i) => {
              const id = `${it.id}:${i}`
              const name = c.kind === 'add' ? 'write_file' : 'edit_file'
              this.card(id, name, rel(this.cwd, c.path), { path: c.path })
              this.done(id, it.status !== 'failed', `${c.kind === 'add' ? 'Created' : c.kind === 'delete' ? 'Deleted' : 'Updated'} ${rel(this.cwd, c.path)}`)
            })
            return
          }
          case 'mcp_tool_call': {
            const name = `mcp__${it.server}__${it.tool}`
            this.card(it.id, name, oneLine(JSON.stringify(it.arguments ?? {})), it.arguments ?? {})
            if (finished) this.done(it.id, it.status !== 'failed' && !it.error, it.error?.message ?? clip(JSON.stringify(it.result?.content ?? it.result ?? '')))
            return
          }
          case 'web_search':
            this.card(it.id, 'web_search', oneLine(it.query), { query: it.query })
            if (finished) this.done(it.id, true, '')
            return
          case 'todo_list':
            if (Array.isArray(it.items)) {
              const text = it.items.map((t: any) => `[${t.completed ? 'x' : ' '}] ${t.text}`).join('\n')
              this.card(it.id, 'todo_write', 'tasks', { todos: it.items })
              this.done(it.id, true, text)
              // A list that changes is one card, not a pile of them.
              this.open.delete(it.id)
            }
            return
          case 'error':
            if (finished && it.message) sink.note(oneLine(it.message, 300))
            return
        }
        return
      }
      case 'turn.completed': {
        const u = o.usage
        if (u) {
          const cached = u.cached_input_tokens ?? 0
          sink.usage({ input: Math.max(0, (u.input_tokens ?? 0) - cached), output: u.output_tokens ?? 0, cacheRead: cached })
          sink.context((u.input_tokens ?? 0) + (u.output_tokens ?? 0))
        }
        return
      }
      case 'turn.failed':
        this.error = String(o.error?.message ?? 'Codex stopped with an error.')
        return
      case 'error':
        // Reconnect notices are also reported as errors; only the final failure ends the turn.
        if (!/reconnect|retrying/i.test(String(o.message))) this.error ??= String(o.message ?? 'Codex stopped with an error.')
        return
    }
  }

  finish() {
    return this.log.finish()
  }
}

export interface CodexRun {
  model: string
  effort?: Effort
  mode: PermissionMode
  cwd: string
  resume?: string
}

/** Codex's sandbox for each mode. A headless run cannot ask, so Manual and Plan only read. */
export const CODEX_SANDBOX: Record<PermissionMode, string> = { manual: 'read-only', plan: 'read-only', auto: 'workspace-write', bypass: 'danger-full-access' }

export function codexArgs(r: CodexRun): string[] {
  const model = findModel('codex', r.model)
  const args = ['exec', '--json', '--skip-git-repo-check', '-C', r.cwd, '--sandbox', CODEX_SANDBOX[r.mode]]
  if (r.model) args.push('-m', model?.id ?? r.model)
  if (r.effort && r.effort !== 'auto' && model?.efforts?.includes(r.effort)) args.push('-c', `model_reasoning_effort="${r.effort}"`)
  if (r.resume) args.push('resume', r.resume)
  // The prompt comes on stdin so a long one never hits an argument limit.
  args.push('-')
  return args
}
