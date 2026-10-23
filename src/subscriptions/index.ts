import type { Effort } from '../effort.js'
import type { ChatRequest, ChatResult, Msg, PermissionMode, Provider, Usage } from '../types.js'
import { SUBSCRIPTIONS, type SubscriptionId } from './catalog.js'
import { claudeArgs, ClaudeStream } from './claude.js'
import { findBinary, spawnLines } from './cli.js'
import { codexArgs, CodexStream } from './codex.js'
import type { StreamReader, TurnSink } from './events.js'

export { SUBSCRIPTIONS, isSubscription, subscriptionModels, defaultModel, modelEfforts, modelWindow, type SubscriptionId, type SubscriptionModel } from './catalog.js'
export { detect, type CliStatus } from './cli.js'

export interface ExternalTurn {
  id: SubscriptionId
  model: string
  /** What the user typed (plus any attached file text). */
  prompt: string
  cwd: string
  mode: PermissionMode
  effort?: Effort
  /** The CLI's id for this conversation from an earlier turn. */
  resume?: string
  /** Earlier messages, used to catch the CLI up when it has no conversation of its own yet. */
  history?: Msg[]
  plain?: boolean
  oneShot?: boolean
  userName?: string
  signal: AbortSignal
  sink: TurnSink
}

/** What the CLI is told so far when it has not been part of the chat: the last stretch of it, as plain text. */
export function catchUp(history: Msg[], limit = 12000): string {
  const lines: string[] = []
  for (const m of history) {
    if (m.role === 'user') lines.push(`User: ${(m.display ?? m.content).trim()}`)
    else if (m.role === 'assistant' && m.content.trim()) lines.push(`Assistant: ${m.content.trim()}`)
  }
  let text = ''
  for (const l of lines.reverse()) {
    if (text.length + l.length > limit) break
    text = `${l}\n\n${text}`
  }
  return text.trim()
}

/** Run one turn through the subscription CLI. Resolves with the CLI's conversation id and the turn's messages. */
export async function runExternal(t: ExternalTurn): Promise<{ sessionId?: string; messages: Msg[] }> {
  const info = SUBSCRIPTIONS[t.id]
  const file = findBinary(info.binary)
  if (!file) throw new Error(`${info.label} needs the ${info.binary} command. Install it with: ${info.install}`)
  const reader: StreamReader = t.id === 'claude-code' ? new ClaudeStream(t.sink, t.cwd) : new CodexStream(t.sink, t.cwd)
  const args = t.id === 'claude-code' ? claudeArgs({ model: t.model, effort: t.effort, mode: t.mode, resume: t.resume, plain: t.plain, oneShot: t.oneShot, userName: t.userName }) : codexArgs({ model: t.model, effort: t.effort, mode: t.mode, cwd: t.cwd, resume: t.resume })
  const past = !t.resume && t.history?.length ? catchUp(t.history) : ''
  const stdin = past ? `Earlier in this conversation (continue from it, do not repeat it):\n\n${past}\n\n---\n\n${t.prompt}` : t.prompt
  let stderr = ''
  const run = spawnLines(file, args, { cwd: t.cwd, signal: t.signal, stdin, onLine: (l) => reader.feed(l), onStderr: (s) => (stderr = (stderr + s).slice(-2000)) })
  const code = await run.done
  t.sink.textEnd()
  const messages = reader.finish()
  if (t.signal.aborted) return { sessionId: reader.sessionId, messages }
  if (reader.error) throw Object.assign(new Error(reader.error), { sessionId: reader.sessionId })
  if (code !== 0) {
    const tail = stderr.trim().split('\n').slice(-3).join('\n')
    throw new Error(tail || `${info.binary} exited with code ${code}.`)
  }
  return { sessionId: reader.sessionId, messages }
}

/** A plain request-and-reply provider on a subscription, for the small jobs around a chat (commit messages, summaries). */
export function subscriptionProvider(id: SubscriptionId, model: string): Provider {
  return {
    async chat(req: ChatRequest, onText: (d: string) => void): Promise<ChatResult> {
      let text = ''
      let usage: Usage = { input: 0, output: 0 }
      const last = [...req.messages].reverse().find((m) => m.role === 'user')
      const prompt = `${req.system}\n\n${last?.role === 'user' ? last.content : ''}`
      const { messages } = await runExternal({
        id,
        model,
        prompt,
        cwd: process.cwd(),
        mode: 'plan',
        history: req.messages.slice(0, -1),
        oneShot: true,
        signal: req.signal ?? new AbortController().signal,
        sink: {
          thinking() {},
          reasoning() {},
          text: (d) => ((text += d), onText(d)),
          textEnd() {},
          toolRunning() {},
          toolDone() {},
          usage: (u) => (usage = u),
          context() {},
          note() {},
        },
      })
      // Codex reports a message whole; the text above is the same words, so do not count them twice.
      return { text: text || messages.map((m) => (m.role === 'assistant' ? m.content : '')).join(''), toolCalls: [], usage }
    },
  }
}
