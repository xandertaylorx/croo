import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Config, Profile, ProviderType } from './types.js'

export const DEFAULT_BASE_URLS: Record<'openai' | 'anthropic' | 'gemini', string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
}

const ENV_KEYS: Record<'openai' | 'anthropic' | 'gemini', string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(base, 'croo', 'config.json')
}

export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(base, 'croo')
}

export function defaultConfig(): Config {
  return { activeProfile: '', profiles: {}, pet: true, animations: true, permissionMode: 'auto', notify: true, effort: 'auto', memory: true, diagnostics: true }
}

/** Returns null when no config file exists. Throws a readable error if it is malformed. */
export function loadConfig(file = configPath()): Config | null {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (e: any) {
    if (e.code === 'ENOENT') return null
    throw e
  }
  let data: any
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error(`Config at ${file} is not valid JSON.`)
  }
  const cfg = { ...defaultConfig(), ...data } as Config
  if (!cfg.profiles || typeof cfg.profiles !== 'object') cfg.profiles = {}
  if (!['manual', 'auto', 'plan', 'bypass'].includes(cfg.permissionMode)) cfg.permissionMode = 'auto'
  if (typeof cfg.diagnostics !== 'boolean') cfg.diagnostics = true
  if (typeof cfg.notify !== 'boolean') cfg.notify = true
  if (typeof cfg.memory !== 'boolean') cfg.memory = true
  if (!['auto', 'low', 'medium', 'high', 'xhigh', 'max'].includes(cfg.effort)) cfg.effort = 'auto'
  for (const [name, p] of Object.entries(cfg.profiles)) {
    if (!p || !['openai', 'anthropic', 'gemini', 'claude-code', 'codex'].includes(p.type) || !p.model) {
      throw new Error(`Profile "${name}" in ${file} needs a valid "type" and "model".`)
    }
  }
  if (!cfg.activeProfile || !cfg.profiles[cfg.activeProfile]) {
    cfg.activeProfile = Object.keys(cfg.profiles)[0] ?? ''
  }
  return cfg
}

export function saveConfig(cfg: Config, file = configPath()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 })
  // writeFileSync only applies the mode on creation; enforce it for existing files too.
  fs.chmodSync(file, 0o600)
}

/** Key priority: profile.apiKey, CROO_API_KEY, then the provider's conventional env var. */
export function resolveApiKey(profile: Profile, env: NodeJS.ProcessEnv = process.env): string | undefined {
  // A subscription signs in through its own CLI and never sees a key.
  if (profile.type === 'claude-code' || profile.type === 'codex') return undefined
  return profile.apiKey || env.CROO_API_KEY || env[ENV_KEYS[profile.type]] || undefined
}

export function maskKey(key?: string): string {
  if (!key) return '(none)'
  return key.length <= 8 ? '****' : `${key.slice(0, 3)}…${key.slice(-4)}`
}

export function isLocalUrl(url?: string): boolean {
  if (!url) return false
  try {
    const h = new URL(url).hostname
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1' || h === '0.0.0.0'
  } catch {
    return false
  }
}
