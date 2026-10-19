import type { Msg, Provider, ToolCall, Usage } from './types.js'
import { TOOLS, toolByName, truncate, type Preview } from './tools/index.js'
import type { Permissions } from './permissions.js'

export interface AgentHooks {
  onThinking(): void
  onText(delta: string): void
  onTextEnd(): void
  onToolRunning(name: string, summary: string): void
  onToolDone(name: string, summary: string, ok: boolean, result: string): void
  confirm(name: string, preview: Preview): Promise<'y' | 'n' | 'a'>
  onUsage(u: Usage): void
}

export interface TurnOptions {
  provider: Provider
  system: string
  messages: Msg[]
  cwd: string
  permissions: Permissions
  hooks: AgentHooks
  signal: AbortSignal
  maxSteps?: number
}

export class Cancelled extends Error {
  constructor() {
    super('Cancelled')
  }
}

/** Run the model/tool loop until the model stops calling tools. Mutates `messages`. */
export async function runTurn(o: TurnOptions): Promise<void> {
  const { hooks, signal } = o
  for (let step = 0; step < (o.maxSteps ?? 50); step++) {
    hooks.onThinking()
    let res
    try {
      res = await o.provider.chat(
        { system: o.system, messages: o.messages, tools: TOOLS.map((t) => t.spec), signal },
        hooks.onText,
      )
    } catch (e) {
      hooks.onTextEnd()
      if (signal.aborted) throw new Cancelled()
      throw e
    }
    hooks.onTextEnd()
    hooks.onUsage(res.usage)
    o.messages.push({ role: 'assistant', content: res.text, toolCalls: res.toolCalls.length ? res.toolCalls : undefined })
    if (!res.toolCalls.length) return

    for (let i = 0; i < res.toolCalls.length; i++) {
      if (signal.aborted) {
        for (const c of res.toolCalls.slice(i)) o.messages.push(toolMsg(c, 'Cancelled by user.', true))
        throw new Cancelled()
      }
      o.messages.push(await execute(res.toolCalls[i], o))
    }
  }
  throw new Error(`Stopped after ${o.maxSteps ?? 50} steps.`)
}

function toolMsg(c: ToolCall, content: string, isError: boolean): Msg {
  return { role: 'tool', toolCallId: c.id, name: c.name, content, isError: isError || undefined }
}

async function execute(c: ToolCall, o: TurnOptions): Promise<Msg> {
  const { hooks } = o
  const tool = toolByName(c.name)
  if (!tool) return toolMsg(c, `Unknown tool "${c.name}".`, true)
  let summary = ''
  try {
    summary = tool.summarize(c.args)
    const ctx = { cwd: o.cwd, signal: o.signal }
    const preview = tool.prepare?.(c.args, ctx)
    if (preview && o.permissions.needsApproval(c.name)) {
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
