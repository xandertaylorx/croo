import fs from 'node:fs'
import path from 'node:path'
import type { Msg, ToolCall, Usage } from '../types.js'

/** What a subscription CLI's stream turns into: the same things the app's own agent loop reports. */
export interface TurnSink {
  /** A new step of the model started. */
  thinking(): void
  reasoning(delta: string): void
  text(delta: string): void
  textEnd(): void
  toolRunning(name: string, summary: string): void
  toolDone(name: string, summary: string, ok: boolean, result: string): void
  usage(u: Usage): void
  /** Tokens the conversation takes in the model's context right now. */
  context(used: number): void
  note(text: string): void
}

/** Common face of the per-CLI stream readers. Feed it each line the CLI prints. */
export interface StreamReader {
  feed(line: string): void
  /** The CLI's own id for the conversation, to continue it next turn. */
  sessionId?: string
  /** Set when the CLI reported a failure; the turn should end with this message. */
  error?: string
  /** The turn as chat messages (text, tool calls, results), so the chat can be shown again later. */
  finish(): Msg[]
}

/** Keeps a turn's messages in the shape the transcript expects: an assistant message with its calls, then their results. */
export class Log {
  readonly msgs: Msg[] = []
  private text = ''
  private current?: { id: string; msg: Extract<Msg, { role: 'assistant' }> }

  addText(delta: string) {
    this.text += delta
  }
  /** A new model message begins: text from before it that no tool call claimed is its own message. */
  startStep() {
    this.flush()
    // Calls after this belong to a new assistant message, never an earlier one.
    this.current = undefined
  }
  call(messageId: string, call: ToolCall) {
    if (this.current?.id !== messageId) {
      const msg: Extract<Msg, { role: 'assistant' }> = { role: 'assistant', content: this.text, toolCalls: [] }
      this.text = ''
      this.msgs.push(msg)
      this.current = { id: messageId, msg }
    }
    this.current.msg.toolCalls!.push(call)
  }
  result(call: ToolCall, content: string, isError: boolean) {
    this.msgs.push({ role: 'tool', toolCallId: call.id, name: call.name, content, isError: isError || undefined })
  }
  private flush() {
    if (this.text.trim()) this.msgs.push({ role: 'assistant', content: this.text })
    this.text = ''
  }
  finish(): Msg[] {
    this.flush()
    // A turn that was stopped can leave calls without results; a model picking the chat up later needs each one answered.
    const answered = new Set(this.msgs.flatMap((m) => (m.role === 'tool' ? [m.toolCallId] : [])))
    for (const m of [...this.msgs]) {
      for (const c of m.role === 'assistant' ? (m.toolCalls ?? []) : []) {
        if (!answered.has(c.id)) this.msgs.push({ role: 'tool', toolCallId: c.id, name: c.name, content: 'Cancelled by user.', isError: true })
      }
    }
    return this.msgs
  }
}

export const clip = (s: string, n = 12000) => (s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more characters)` : s)

/** A path as the folder knows it: relative when inside it, also when the folder is reached through a symlink (/tmp on a Mac). */
export function relPath(cwd: string, p: unknown): string {
  if (typeof p !== 'string' || !p) return ''
  let real = cwd
  try {
    real = fs.realpathSync(cwd)
  } catch {}
  for (const base of [cwd, real]) {
    const r = path.relative(base, p)
    if (r && !r.startsWith('..') && !path.isAbsolute(r)) return r
  }
  return p
}
