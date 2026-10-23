import fs from 'node:fs'
import path from 'node:path'
import { dataDir } from '../config.js'
import type { Effort } from '../effort.js'
import type { SubscriptionId } from './info.js'

export { SUBSCRIPTIONS, isSubscription, type SubscriptionId, type SubscriptionInfo } from './info.js'

export interface SubscriptionModel {
  /** What the CLI is given with --model. */
  id: string
  name: string
  /** `legacy` models still work but are left out of the picker unless typed in. */
  status: 'current' | 'legacy'
  /** Other names people type for it: "opus", "sonnet-5.5". */
  aliases?: string[]
  efforts?: Effort[]
  /** Tokens of context, for the ring. */
  window?: number
  badge?: 'new'
}


const CLAUDE_EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const CODEX_EFFORTS: Effort[] = ['low', 'medium', 'high']

/**
 * Bundled model lists, newest first. Subscriptions have no /models endpoint to ask, so this is the source of
 * truth; `models.json` in Croo's data folder adds to it or overrides an entry, so a model that ships tomorrow
 * works today without waiting for an app update.
 */
const BUNDLED: Record<SubscriptionId, SubscriptionModel[]> = {
  'claude-code': [
    { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', status: 'current', aliases: ['fable'], efforts: CLAUDE_EFFORTS, window: 1_000_000 },
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', status: 'current', aliases: ['opus'], efforts: CLAUDE_EFFORTS, window: 1_000_000 },
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', status: 'current', aliases: ['sonnet'], efforts: CLAUDE_EFFORTS, window: 1_000_000 },
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', status: 'current', aliases: ['haiku'], efforts: CLAUDE_EFFORTS, window: 200_000, badge: 'new' },
    { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', status: 'legacy', efforts: CLAUDE_EFFORTS, window: 200_000 },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', status: 'legacy', efforts: ['low', 'medium', 'high', 'max'], window: 200_000 },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', status: 'legacy', window: 200_000 },
  ],
  codex: [
    { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', status: 'current', efforts: CODEX_EFFORTS, window: 400_000 },
    { id: 'gpt-6-astra', name: 'GPT-6 Astra', status: 'current', efforts: CODEX_EFFORTS, window: 400_000 },
    { id: 'gpt-6-luna', name: 'GPT-6 Luna', status: 'current', efforts: CODEX_EFFORTS, window: 400_000 },
    { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', status: 'legacy', efforts: CODEX_EFFORTS, window: 272_000 },
    { id: 'gpt-5.5', name: 'GPT-5.5', status: 'legacy', efforts: CODEX_EFFORTS, window: 272_000 },
  ],
}

const DEFAULTS: Record<SubscriptionId, string> = { 'claude-code': 'claude-sonnet-5-5', codex: 'gpt-6.1-sol' }
export const defaultModel = (id: SubscriptionId) => DEFAULTS[id]

/** `models.json`: `{ "claude-code": [ { "id": "...", "name": "...", "status": "current" } ] }`. A bad file is ignored. */
function userModels(dir = dataDir()): Partial<Record<SubscriptionId, SubscriptionModel[]>> {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'models.json'), 'utf8'))
    const out: Partial<Record<SubscriptionId, SubscriptionModel[]>> = {}
    for (const id of Object.keys(BUNDLED) as SubscriptionId[]) {
      const list = Array.isArray(raw?.[id]) ? raw[id] : []
      out[id] = list.filter((m: any) => m && typeof m.id === 'string' && m.id).map((m: any) => ({ name: m.id, status: 'current', ...m }))
    }
    return out
  } catch {
    return {}
  }
}

/** Every model for a subscription: your additions first, then the bundled ones they did not replace. */
export function subscriptionModels(id: SubscriptionId, dir = dataDir()): SubscriptionModel[] {
  const mine = userModels(dir)[id] ?? []
  const taken = new Set(mine.map((m) => m.id))
  return [...mine, ...BUNDLED[id].filter((m) => !taken.has(m.id))]
}

/** Finds a model by id or by any alias ("opus", "sonnet-5.5"); null for one we do not know (it is passed through as typed). */
export function findModel(id: SubscriptionId, name: string, dir?: string): SubscriptionModel | null {
  const n = name.trim().toLowerCase()
  return subscriptionModels(id, dir).find((m) => m.id.toLowerCase() === n || m.aliases?.some((a) => a.toLowerCase() === n) || m.id.replace(/\./g, '-').toLowerCase() === n.replace(/\./g, '-')) ?? null
}

export function modelEfforts(id: SubscriptionId, name: string): Effort[] | null {
  return findModel(id, name)?.efforts ?? null
}

export function modelWindow(id: SubscriptionId, name: string): number {
  return findModel(id, name)?.window ?? (id === 'claude-code' ? 200_000 : 272_000)
}
