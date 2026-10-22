import type { Msg, Provider, ToolCall, Usage } from './types.js'
import { TOOLS, toolByName, truncate, type Preview, type Tool } from './tools/index.js'
import type { Permissions } from './permissions.js'
import { COMPACT_AT, compact, isContextOverflow, modelView, promptTokens } from './compact.js'

export interface AgentHooks {
  onThinking(): void
  onText(delta: string): void
  onReasoning?(delta: string): void
  onTextEnd(): void
  onToolRunning(name: string, summary: string): void
  onToolDone(name: string, summary: string, ok: boolean, result: string): void
  confirm(name: string, preview: Preview): Promise<'y' | 'n' | 'a'>
  onUsage(u: Usage): void
  /** The older part of the conversation was just summarized to free up context. */
  onCompacted?(): void
  /** Tokens the conversation now takes in the model's context (the last request plus its reply). */
  onContext?(tokens: number): void
}

export interface TurnOptions {
  provider: Provider
  system: string
  messages: Msg[]
  cwd: string
  permissions: Permissions
  hooks: AgentHooks
  signal: AbortSignal
  effort?: import('./effort.js').Effort
  /** Defaults to every tool. Pass [] for a plain conversation. */
  tools?: Tool[]
  maxSteps?: number
  /** The model's context window in tokens. When set, the conversation is compacted before it overflows. */
  contextWindow?: number
}

export class Cancelled extends Error {
  constructor() {
    super('Cancelled')
  }
}

/**
 * Small models often write a tool call out as text (`{"name":"bash","arguments":{...}}` or a <tool_call> tag)
 * instead of using the tool channel. Recognise those for the tools we actually offered, and return the
 * text without them. They still go through the normal approval step.
 */
export function extractTextToolCalls(text: string, names: string[]): { calls: ToolCall[]; rest: string } {
  const calls: ToolCall[] = []
  const take = (json: string): boolean => {
    try {
      const o = JSON.parse(json)
      const args = o?.arguments ?? o?.parameters ?? o?.args
      if (typeof o?.name !== 'string' || !names.includes(o.name) || !args || typeof args !== 'object') return false
      calls.push({ id: `text-${calls.length}-${Date.now().toString(36)}`, name: o.name, args })
      return true
    } catch {
      return false
    }
  }
  let rest = text.replace(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g, (m, j) => (take(j) ? '' : m))
  rest = rest.replace(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g, (m, j) => (take(j) ? '' : m))
  if (!calls.length && /^\s*\{[\s\S]*\}\s*$/.test(rest) && take(rest.trim())) rest = ''
  return { calls, rest: rest.trim() }
}

/** Run the model/tool loop until the model stops calling tools. Mutates `messages`. */
export async function runTurn(o: TurnOptions): Promise<void> {
  const { hooks, signal } = o
  const tools = o.tools ?? TOOLS
  const maxSteps = o.maxSteps ?? 200
  let lastPrompt = 0
  const shrink = async (hard: boolean) => {
    if (!o.contextWindow) return false
    hooks.onThinking()
    const done = await compact({ provider: o.provider, messages: o.messages, window: o.contextWindow, signal, hard })
    if (!done) return false
    hooks.onUsage(done.usage)
    hooks.onCompacted?.()
    return true
  }
  for (let step = 0; step < maxSteps; step++) {
    if (o.contextWindow && lastPrompt > o.contextWindow * COMPACT_AT) await guard(signal, () => shrink(false))
    hooks.onThinking()
    let res
    for (let attempt = 0; ; attempt++) {
      try {
        res = await o.provider.chat(
          { system: o.system, messages: modelView(o.messages), tools: tools.map((t) => t.spec), signal, effort: o.effort },
          hooks.onText,
          hooks.onReasoning,
        )
        break
      } catch (e) {
        hooks.onTextEnd()
        if (signal.aborted) throw new Cancelled()
        // The request did not fit: summarize harder and try again.
        if (attempt < 2 && isContextOverflow(e) && (await guard(signal, () => shrink(attempt > 0)))) continue
        throw e
      }
    }
    hooks.onTextEnd()
    hooks.onUsage(res.usage)
    lastPrompt = promptTokens(res.usage) + res.usage.output
    hooks.onContext?.(lastPrompt)
    if (!res.toolCalls.length) {
      const found = extractTextToolCalls(res.text, tools.map((t) => t.spec.name))
      if (found.calls.length) res = { ...res, text: found.rest, toolCalls: found.calls }
    }
    o.messages.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls.length ? res.toolCalls : undefined, thinking: res.thinking || undefined, meta: res.meta })
    if (!res.toolCalls.length) return

    const calls = res.toolCalls
    for (let i = 0; i < calls.length; ) {
      if (signal.aborted) {
        for (const c of calls.slice(i)) o.messages.push(toolMsg(c, 'Cancelled by user.', true))
        throw new Cancelled()
      }
      // Read-only calls that need no approval run together; results still go back in the order they were asked.
      let j = i
      while (j < calls.length && runsFreely(calls[j], o)) j++
      if (j - i > 1) {
        o.messages.push(...(await Promise.all(calls.slice(i, j).map((c) => execute(c, o)))))
        i = j
      } else o.messages.push(await execute(calls[i++], o))
    }
  }
  throw new Error(`Stopped after ${maxSteps} steps.`)
}

const runsFreely = (c: ToolCall, o: TurnOptions) => o.permissions.isReadOnly(c.name) && !o.permissions.needsApproval(c.name, c.args)

/** Run `fn`, turning an abort during it into Cancelled. */
async function guard<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (signal.aborted) throw new Cancelled()
    throw e
  }
}

function toolMsg(c: ToolCall, content: string, isError: boolean): Msg {
  return { role: 'tool', toolCallId: c.id, name: c.name, content, isError: isError || undefined }
}

async function execute(c: ToolCall, o: TurnOptions): Promise<Msg> {
  const { hooks } = o
  const tool = (o.tools ?? TOOLS).find((t) => t.spec.name === c.name) ?? toolByName(c.name)
  if (!tool) return toolMsg(c, `Unknown tool "${c.name}".`, true)
  let summary = ''
  try {
    summary = tool.summarize(c.args)
    const ctx = { cwd: o.cwd, signal: o.signal }
    if (o.permissions.needsApproval(c.name, c.args)) {
      const preview: Preview = tool.prepare?.(c.args, ctx) ?? { kind: 'read', tool: c.name, summary }
      const answer = await hooks.confirm(c.name, preview)
      if (answer === 'n') {
        hooks.onToolDone(c.name, summary, false, 'denied')
        return toolMsg(c, 'The user denied this action. Do not retry it; ask what they would like instead.', true)
      }
      if (answer === 'a') o.permissions.allowAlways(c.name)
    }
    hooks.onToolRunning(c.name, summary)
    const result = truncate(await tool.run(c.args, ctx))
    hooks.onToolDone(c.name, summary, true, result)
    return toolMsg(c, result, false)
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    hooks.onToolDone(c.name, summary, false, msg)
    return toolMsg(c, `Error: ${msg}`, true)
  }
}
