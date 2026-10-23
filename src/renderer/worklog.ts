import type { Item } from '../shared/ipc.js'

type ToolItem = Extract<Item, { kind: 'tool' }>

/** What a tool call does, for the one-line summary above a run of them. */
export type Action = 'edit' | 'command' | 'read' | 'search' | 'web' | 'other'

const ACTIONS: Record<string, Action> = {
  write_file: 'edit',
  edit_file: 'edit',
  multi_edit: 'edit',
  bash: 'command',
  bash_output: 'command',
  bash_kill: 'command',
  diagnostics: 'command',
  read_file: 'read',
  list_files: 'read',
  grep: 'search',
  task: 'search',
  web_fetch: 'web',
  web_search: 'web',
  browser: 'web',
}

export const actionOf = (name: string): Action => ACTIONS[name] ?? 'other'

/** Edits and commands are what the user cares about most, so they win when the summary has to be short. */
const PRIORITY: Action[] = ['edit', 'command', 'read', 'search', 'web', 'other']

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Files and pages are counted once however many times they were touched. */
function label(action: Action, items: ToolItem[]): string {
  const distinct = new Set(items.map((i) => i.summary)).size
  switch (action) {
    case 'edit':
      return `Edited ${plural(distinct, 'file')}`
    case 'command':
      return `Ran ${plural(items.length, 'command')}`
    case 'read':
      return `Read ${plural(distinct, 'file')}`
    case 'search':
      return `Ran ${plural(items.length, 'search', 'searches')}`
    case 'web':
      return `Opened ${plural(distinct, 'page')}`
    case 'other':
      return `Used ${plural(items.length, 'tool')}`
  }
}

/** The tool calls in a run that count towards its summary. The pinned task list is not one of them. */
export const countable = (items: Item[]): ToolItem[] => items.filter((i): i is ToolItem => i.kind === 'tool' && i.name !== 'todo_write')

/**
 * "Edited 2 files and ran 3 commands": the two most important kinds of work in a run of tool calls, then
 * "and 4 other actions" for the rest. The summary a collapsed group shows.
 */
export function summarize(items: Item[]): { text: string; failed: number } {
  const tools = countable(items)
  if (!tools.length) return { text: items.some((i) => i.kind === 'thinking') ? 'Thought' : '', failed: 0 }
  const by = new Map<Action, ToolItem[]>()
  for (const t of tools) by.set(actionOf(t.name), [...(by.get(actionOf(t.name)) ?? []), t])
  const shown = PRIORITY.filter((a) => by.has(a)).slice(0, 2)
  const labels = shown.map((a) => label(a, by.get(a)!))
  const rest = tools.length - shown.reduce((n, a) => n + by.get(a)!.length, 0)
  if (rest > 0) labels.push(`${plural(rest, 'other action')}`)
  const text = labels.map((l, i) => (i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1))).join(labels.length > 2 ? ', ' : ' and ')
  return { text: labels.length > 2 ? text.replace(/, ([^,]*)$/, ', and $1') : text, failed: tools.filter((t) => t.status === 'error').length }
}

/** The files a run changed, newest edit last, without repeats. Paths are what the tools reported. */
export function changedFiles(items: Item[]): string[] {
  const out: string[] = []
  for (const t of countable(items)) {
    if (actionOf(t.name) !== 'edit' || t.status !== 'ok') continue
    const i = out.indexOf(t.summary)
    if (i >= 0) out.splice(i, 1)
    out.push(t.summary)
  }
  return out
}

/**
 * Where a new item goes: tool calls and reasoning that follow each other form one group, and anything
 * else (a message, a note, an approval card, an error) closes it.
 */
export const groupable = (item: Item) => (item.kind === 'tool' && item.name !== 'todo_write') || item.kind === 'thinking'
