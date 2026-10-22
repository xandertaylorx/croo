import type { Msg, Provider, Usage } from './types.js'

/**
 * Context compaction. When a conversation nears the model's context window, everything but the most recent
 * stretch is summarized by the model itself. The summary is stored on the first kept message
 * (`summaryBefore`), so the chat still shows the full history and editing an earlier message drops the
 * summary along with what it summarized.
 */

/** A conservative context window per model, in tokens. Unknown models get a size most current ones exceed. */
export function contextWindow(model: string, local = false): number {
  const m = model.toLowerCase()
  if (local) return 16_384
  if (/claude|opus|sonnet|haiku|fable|mythos/.test(m)) return 200_000
  if (/gemini/.test(m)) return 1_000_000
  if (/gpt-4\.1/.test(m)) return 1_000_000
  if (/gpt-5|o3|o4/.test(m)) return 272_000
  if (/gpt-4o|gpt-4-turbo/.test(m)) return 128_000
  if (/deepseek/.test(m)) return 128_000
  if (/grok/.test(m)) return 256_000
  return 128_000
}

/** Compact once a request used this share of the window, leaving room for the reply and the next tool results. */
export const COMPACT_AT = 0.8
/** How much of the window the kept, verbatim tail may take. */
const KEEP_SHARE = 0.25

/** Every token the request consumed, cached or not. */
export const promptTokens = (u: Usage) => u.input + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0)

/** Errors that mean the request did not fit, across providers. */
export const isContextOverflow = (e: unknown) =>
  /prompt is too long|context[ _-]?length|context window|maximum context|too many tokens|exceeds the (?:maximum|context)|input is too long|request too large/i.test(String((e as any)?.message ?? e))

/** The messages the model actually gets: the latest summary, then everything after it. */
export function modelView(messages: Msg[]): Msg[] {
  let i = messages.length - 1
  while (i >= 0 && !messages[i].summaryBefore) i--
  if (i < 0) return messages
  const first = messages[i]
  const intro = `[Earlier parts of this conversation were summarized to save space.]\n\n${first.summaryBefore}`
  const tail = messages.slice(i)
  // Fold the summary into a leading user message so roles still alternate for every provider.
  if (first.role === 'user') return [{ ...first, content: `${intro}\n\n---\n\n${first.content}` }, ...tail.slice(1)]
  return [{ role: 'user', content: intro }, ...tail]
}

/** Rough token count: about four characters per token, plus a little per message. */
const approxTokens = (m: Msg) => Math.ceil((m.content.length + JSON.stringify((m as any).toolCalls ?? '').length) / 4) + 4

/**
 * Where the verbatim tail should start: the earliest index whose suffix fits in `keepTokens`, moved forward
 * so it never starts on a tool result (a result must follow the call that asked for it). Returns -1 when
 * there is nothing worth summarizing.
 */
export function splitPoint(messages: Msg[], from: number, keepTokens: number): number {
  let used = 0
  let cut = messages.length
  while (cut > from + 1 && used + approxTokens(messages[cut - 1]) <= keepTokens) used += approxTokens(messages[--cut])
  // Always keep at least the last message, and never split a call from its result.
  if (cut >= messages.length) cut = messages.length - 1
  while (cut < messages.length && messages[cut].role === 'tool') cut++
  if (cut >= messages.length) {
    // The tail is one long run of tool results: keep from the call that produced them.
    cut = messages.length - 1
    while (cut > from && messages[cut].role === 'tool') cut--
  }
  return cut > from ? cut : -1
}

const clipText = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n… [${s.length - n} characters omitted]` : s)

/** The messages to summarize as plain text, so the request needs no tools and fits any provider. */
export function transcript(messages: Msg[], budgetChars: number): string {
  const lines: string[] = []
  for (const m of messages) {
    if (m.summaryBefore) lines.push(`## Summary of what came before\n${m.summaryBefore}`)
    if (m.role === 'user') lines.push(`## User\n${clipText(m.content, 6000)}`)
    else if (m.role === 'assistant') {
      const calls = (m.toolCalls ?? []).map((c) => `→ ${c.name}(${clipText(JSON.stringify(c.args), 1500)})`)
      lines.push(`## Assistant\n${[clipText(m.content, 6000), ...calls].filter(Boolean).join('\n')}`)
    } else lines.push(`## Tool result (${m.name}${m.isError ? ', error' : ''})\n${clipText(m.content, 1200)}`)
  }
  let text = lines.join('\n\n')
  // Keep the newest part if it is still too long: that is what the summary most needs to get right.
  if (text.length > budgetChars) text = `… [older messages omitted]\n\n${text.slice(-budgetChars)}`
  return text
}

export const COMPACT_SYSTEM = 'You summarize a coding session between a user and an AI coding agent so the agent can continue the work with no other memory of it. Be precise and complete; never invent details.'

export const COMPACT_PROMPT = `Write a summary of the conversation above for the agent to continue from. Use these sections:

1. **Requests** — everything the user asked for, in their words where it matters, including corrections and preferences they stated.
2. **State of the work** — what is done, what is in progress, and what is left. Be explicit about the very last thing being worked on.
3. **Files** — every file read, created or changed, with what changed and why. Include short code snippets, function signatures or exact strings when the next steps depend on them.
4. **Findings and decisions** — key technical facts learned about the project (commands, architecture, conventions) and decisions made.
5. **Errors** — problems hit and how they were fixed, or that remain unsolved.
6. **Next step** — the single next action, only if it follows directly from the user's latest request.

Write only the summary.`

export interface CompactOptions {
  provider: Provider
  messages: Msg[]
  window: number
  signal?: AbortSignal
  /** Ask for more aggressive compaction (after the provider said the request did not fit). */
  hard?: boolean
}

/**
 * Summarize the older part of `messages` and mark the first kept message with the summary. Mutates
 * `messages`. Returns false when there was nothing to compact.
 */
export async function compact(o: CompactOptions): Promise<{ usage: Usage } | false> {
  let start = o.messages.length - 1
  while (start >= 0 && !o.messages[start].summaryBefore) start--
  const from = Math.max(0, start)
  const cut = splitPoint(o.messages, from, Math.floor(o.window * (o.hard ? KEEP_SHARE / 2 : KEEP_SHARE)))
  if (cut < 0) return false
  // A transcript of at most half the window, so the summarization request itself fits.
  const text = transcript(o.messages.slice(from, cut), o.window * 2)
  const res = await o.provider.chat(
    { system: COMPACT_SYSTEM, messages: [{ role: 'user', content: `<conversation>\n${text}\n</conversation>\n\n${COMPACT_PROMPT}` }], tools: [], signal: o.signal, effort: 'low' },
    () => {},
  )
  const summary = res.text.trim()
  if (!summary) throw new Error('Could not summarize the conversation to free up context.')
  o.messages[cut] = { ...o.messages[cut], summaryBefore: summary }
  return { usage: res.usage }
}
