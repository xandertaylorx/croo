import type { ImageAtt, Msg, Provider, ToolCall, Usage } from './types.js'
import { TOOLS, readOnlyBash, safePath, toolByName, truncate, type Preview, type Tool, type ToolContext } from './tools/index.js'
import { Permissions } from './permissions.js'
import { COMPACT_AT, compact, isContextOverflow, modelView, promptTokens } from './compact.js'
import { CHECKABLE, diagnose } from './tools/diagnostics.js'
import { skillTool } from './tools/meta.js'
import { buildSubagentPrompt } from './prompt.js'
import type { Hooks } from './hooks.js'

export interface AgentHooks {
  onThinking(): void
  onText(delta: string): void
  onReasoning?(delta: string): void
  onTextEnd(): void
  onToolRunning(name: string, summary: string): void
  onToolDone(name: string, summary: string, ok: boolean, result: string, images?: ImageAtt[]): void
  confirm(name: string, preview: Preview): Promise<'y' | 'n' | 'a'>
  /** The user approved the plan: plan mode has ended and the agent goes on in Auto mode. */
  onPlanApproved?(): void
  /** A quiet line for the chat, e.g. a Stop hook sending the agent back to work. */
  onNote?(text: string): void
  onUsage(u: Usage): void
  /** The older part of the conversation was just summarized to free up context. */
  onCompacted?(summary?: string): void
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
  /** Defaults to every tool. Pass [] for a plain conversation. A function is asked again every step (plan mode can end mid-turn). */
  tools?: Tool[] | (() => Tool[])
  maxSteps?: number
  /** The model's context window in tokens. When set, the conversation is compacted before it overflows. */
  contextWindow?: number
  /** Called before a file tool changes a file (for checkpoints). */
  beforeWrite?(abs: string): void
  /** The user's hooks for this folder. */
  lifecycle?: Hooks
  /** Check edited files and report errors back to the model in the same step. */
  diagnostics?: boolean
}

const FILE_TOOLS = new Set(['write_file', 'edit_file', 'multi_edit'])
/** Screenshots are large: the model gets the newest few, older ones become a short note. */
const KEEP_IMAGES = 2
/** How many times a Stop hook may send the agent back to work in one turn. */
const MAX_STOP_ROUNDS = 3

const toolsOf = (o: TurnOptions) => (typeof o.tools === 'function' ? o.tools() : (o.tools ?? TOOLS))

/** Drop the images from all but the newest few tool results. */
export function trimToolImages(messages: Msg[], keep = KEEP_IMAGES): Msg[] {
  let seen = 0
  const out = [...messages]
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i]
    if (m.role !== 'tool' || !m.images?.length) continue
    if (++seen > keep) out[i] = { ...m, images: undefined, content: `${m.content}\n[An older screenshot was removed to save space.]` }
  }
  return out
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
  const maxSteps = o.maxSteps ?? 200
  let lastPrompt = 0
  let stopRounds = 0
  const shrink = async (hard: boolean) => {
    if (!o.contextWindow) return false
    hooks.onThinking()
    const done = await compact({ provider: o.provider, messages: o.messages, window: o.contextWindow, signal, hard })
    if (!done) return false
    hooks.onUsage(done.usage)
    hooks.onCompacted?.([...o.messages].reverse().find((x) => x.summaryBefore)?.summaryBefore)
    return true
  }
  for (let step = 0; step < maxSteps; step++) {
    if (o.contextWindow && lastPrompt > o.contextWindow * COMPACT_AT) await guard(signal, () => shrink(false))
    hooks.onThinking()
    const tools = toolsOf(o)
    let res
    for (let attempt = 0; ; attempt++) {
      try {
        res = await o.provider.chat(
          { system: o.system, messages: trimToolImages(modelView(o.messages)), tools: tools.map((t) => t.spec), signal, effort: o.effort },
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
    if (!res.toolCalls.length) {
      // A Stop hook can send the agent back to work, e.g. when the tests still fail.
      const feedback = stopRounds < MAX_STOP_ROUNDS && o.lifecycle?.has('Stop') ? await guard(signal, () => o.lifecycle!.stop()) : ''
      if (!feedback) return
      stopRounds++
      hooks.onNote?.(`Stop hook: ${feedback.split('\n')[0].slice(0, 160)}`)
      o.messages.push({ role: 'user', content: `A Stop hook did not let you finish yet:\n\n${feedback}\n\nAddress this, then finish.`, auto: true })
      continue
    }

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
    if (o.diagnostics) await checkEdits(calls, o)
  }
  throw new Error(`Stopped after ${maxSteps} steps.`)
}

/** After a step that edited files, check them and add any errors to the last edit's result. */
async function checkEdits(calls: ToolCall[], o: TurnOptions) {
  const results = new Map(o.messages.filter((m): m is Extract<Msg, { role: 'tool' }> => m.role === 'tool').slice(-calls.length).map((m) => [m.toolCallId, m]))
  const edited = calls.filter((c) => FILE_TOOLS.has(c.name) && CHECKABLE.test(String(c.args.path ?? '')) && results.get(c.id) && !results.get(c.id)!.isError)
  if (!edited.length) return
  const files: string[] = []
  for (const c of edited) {
    try {
      files.push(safePath(o.cwd, c.args.path))
    } catch {}
  }
  const label = [...new Set(edited.map((c) => String(c.args.path)))].join(', ')
  o.hooks.onToolRunning('diagnostics', label)
  let report = ''
  try {
    report = await diagnose(o.cwd, files, o.signal)
  } catch {}
  if (o.signal.aborted) throw new Cancelled()
  o.hooks.onToolDone('diagnostics', label, !report, report ? report.trim() : 'No problems found.')
  if (report) {
    const last = results.get(edited[edited.length - 1].id)!
    last.content += report
  }
}

/** Run a read-only research agent with a fresh conversation and return its final report. */
async function runSubagent(o: TurnOptions, prompt: string): Promise<string> {
  const messages: Msg[] = [{ role: 'user', content: prompt }]
  const byName = new Map(TOOLS.map((t) => [t.spec.name, t]))
  const tools = [byName.get('read_file')!, byName.get('list_files')!, byName.get('grep')!, readOnlyBash, skillTool]
  await runTurn({
    provider: o.provider,
    system: buildSubagentPrompt(o.cwd),
    messages,
    cwd: o.cwd,
    // Manual mode still asks for every read; otherwise only read-only tools exist, so nothing needs asking.
    permissions: new Permissions(o.permissions.mode === 'manual' ? 'manual' : 'plan'),
    signal: o.signal,
    effort: o.effort,
    tools,
    maxSteps: 60,
    contextWindow: o.contextWindow,
    hooks: { onThinking() {}, onText() {}, onTextEnd() {}, onToolRunning() {}, onToolDone() {}, confirm: o.hooks.confirm, onUsage: o.hooks.onUsage },
  })
  const last = [...messages].reverse().find((m) => m.role === 'assistant' && m.content.trim())
  return last?.content.trim() || 'The subagent finished without a report.'
}

const runsFreely = (c: ToolCall, o: TurnOptions) => o.permissions.isReadOnly(c.name) && !o.permissions.needsApproval(c.name, c.args) && !o.lifecycle?.has('PreToolUse')

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
  const tool = toolsOf(o).find((t) => t.spec.name === c.name)
  // Only what was offered this step runs: plan mode must not reach the file tools by name.
  if (!tool) return toolMsg(c, toolByName(c.name) ? `The ${c.name} tool is not available right now${o.permissions.mode === 'plan' ? ' (plan mode is on: propose a plan first)' : ''}.` : `Unknown tool "${c.name}".`, true)
  let summary = ''
  try {
    summary = tool.summarize(c.args)
    const ctx: ToolContext = { cwd: o.cwd, signal: o.signal, beforeWrite: o.beforeWrite, runSubagent: (p) => runSubagent(o, p) }
    const blocked = o.lifecycle ? await o.lifecycle.preTool({ tool: c.name, args: c.args }) : ''
    if (blocked) {
      hooks.onToolDone(c.name, summary, false, `Blocked by a hook: ${blocked}`)
      return toolMsg(c, `A PreToolUse hook blocked this call:\n${blocked}`, true)
    }
    if (o.permissions.needsApproval(c.name, c.args)) {
      const preview: Preview = tool.prepare?.(c.args, ctx) ?? { kind: 'read', tool: c.name, summary }
      const answer = await hooks.confirm(c.name, preview)
      if (answer === 'n') {
        hooks.onToolDone(c.name, summary, false, 'denied')
        return toolMsg(c, tool.denied ?? 'The user denied this action. Do not retry it; ask what they would like instead.', true)
      }
      if (c.name === 'propose_plan') {
        o.permissions.mode = 'auto'
        hooks.onPlanApproved?.()
      } else if (answer === 'a') o.permissions.allowAlways(c.name)
    }
    hooks.onToolRunning(c.name, summary)
    const out = await tool.run(c.args, ctx)
    let result = truncate(typeof out === 'string' ? out : out.text)
    const images = typeof out === 'string' ? undefined : out.images
    const feedback = o.lifecycle ? await o.lifecycle.postTool({ tool: c.name, args: c.args, result }) : ''
    if (feedback) result += `\n\nA PostToolUse hook reported:\n${feedback}`
    hooks.onToolDone(c.name, summary, true, result, images)
    return { ...toolMsg(c, result, false), ...(images?.length ? { images } : {}) } as Msg
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    hooks.onToolDone(c.name, summary, false, msg)
    return toolMsg(c, `Error: ${msg}`, true)
  }
}
