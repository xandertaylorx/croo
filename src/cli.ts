import readline from 'node:readline'
import pkg from '../package.json' with { type: 'json' }
import { HELP, parseArgs, type Args } from './args.js'
import { runTurn, Cancelled } from './agent.js'
import { DEFAULT_BASE_URLS, configPath, defaultConfig, loadConfig, maskKey, saveConfig } from './config.js'
import { Permissions } from './permissions.js'
import { buildSystemPrompt } from './prompt.js'
import { createProvider } from './providers/index.js'
import { loadLastSession, newSession, saveSession } from './session.js'
import type { Config, Msg, Profile, Provider, ProviderType } from './types.js'
import { frogPet } from './ui/pet.js'
import { Ui } from './ui/render.js'
import { theme } from './ui/theme.js'

const VERSION = pkg.version
const cwd = process.cwd()

type Ask = (question: string, opts?: { secret?: boolean }) => Promise<string>

// ---------- readline / prompts ----------

let rl: readline.Interface | undefined
let cancelAsk: (() => void) | undefined
const getRl = () => (rl ??= readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY }))

const ask: Ask = (question, opts) => {
  if (!process.stdin.isTTY) return Promise.resolve('')
  return new Promise((resolve) => {
    const r = getRl() as any
    let muted = false
    const original = r._writeToOutput
    if (opts?.secret && typeof original === 'function') {
      r._writeToOutput = (s: string) => {
        if (!muted) original.call(r, s)
      }
    }
    const finish = (answer: string) => {
      r._writeToOutput = original
      cancelAsk = undefined
      if (opts?.secret) process.stdout.write('\n')
      resolve(answer)
    }
    cancelAsk = () => finish('')
    r.question(question, (a: string) => finish(a))
    muted = !!opts?.secret // the prompt itself has already been written
  })
}

// ---------- setup ----------

const DEFAULT_MODELS: Record<ProviderType, string> = { openai: 'gpt-4o', anthropic: 'claude-sonnet-4-5', gemini: 'gemini-2.5-pro' }

export async function setupProfile(a: Ask, cfg: Config): Promise<Config> {
  console.log(theme.bold('\nSet up a provider') + theme.muted('  (stored in ' + configPath() + ', mode 600)\n'))
  console.log('  1) OpenAI-compatible  (OpenAI, OpenRouter, Groq, Ollama, LM Studio, ...)\n  2) Anthropic\n  3) Google Gemini\n')
  const choice = (await a('Provider [1]: ')).trim() || '1'
  const type: ProviderType = choice === '2' ? 'anthropic' : choice === '3' ? 'gemini' : 'openai'
  const profile: Profile = { type, model: '' }
  if (type === 'openai') {
    const url = (await a(`Base URL [${DEFAULT_BASE_URLS.openai}] (Ollama: http://localhost:11434/v1): `)).trim()
    if (url) profile.baseUrl = url
  }
  const key = (await a('API key (leave blank to use an env var, or for local models): ', { secret: true })).trim()
  if (key) profile.apiKey = key
  profile.model = (await a(`Model [${DEFAULT_MODELS[type]}]: `)).trim() || DEFAULT_MODELS[type]

  let base = type === 'openai' && profile.baseUrl ? new URL(profile.baseUrl).hostname.replace(/^api\./, '').split('.')[0] : type
  let name = base
  for (let i = 2; cfg.profiles[name]; i++) name = `${base}${i}`
  const next: Config = { ...cfg, profiles: { ...cfg.profiles, [name]: profile }, activeProfile: name }
  saveConfig(next)
  console.log(theme.accent(`\nSaved profile "${name}".\n`))
  return next
}

// ---------- main ----------

async function main() {
  let args: Args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e: any) {
    console.error(e.message + '\n\n' + HELP)
    process.exit(2)
  }
  if (args.help) return console.log(HELP)
  if (args.version) return console.log(VERSION)

  let cfg = loadConfig()
  if (!cfg || !Object.keys(cfg.profiles).length) {
    if (!process.stdin.isTTY) {
      console.error(`No config found. Run \`croo\` in a terminal to set one up, or create ${configPath()}.`)
      process.exit(1)
    }
    console.log(theme.accent(theme.bold('Welcome to Croo.')) + ' No config yet, so let us set one up.')
    cfg = await setupProfile(ask, cfg ?? defaultConfig())
  }
  let profileName = args.profile ?? cfg.activeProfile
  if (!cfg.profiles[profileName]) {
    console.error(`Unknown profile "${profileName}". Available: ${Object.keys(cfg.profiles).join(', ')}`)
    process.exit(1)
  }

  const ui = new Ui({ theme, pet: frogPet, showPet: cfg.pet && !args.noPet, animations: cfg.animations, ask })
  const permissions = new Permissions(args.yolo)
  const interactive = !args.prompt

  let provider: Provider
  const useProfile = (name: string) => {
    provider = createProvider(cfg!.profiles[name])
    profileName = name
  }
  try {
    useProfile(profileName)
  } catch (e: any) {
    ui.petSays('oops', e.message)
    process.exit(1)
  }

  let session = (args.continue && loadLastSession(cwd)) || newSession(cwd, profileName)
  const messages: Msg[] = session.messages
  if (args.continue && messages.length) ui.info(`Resumed session with ${messages.length} messages.`)
  const system = buildSystemPrompt(cwd)
  const totals = { input: 0, output: 0 }
  let current: AbortController | undefined
  let lastInterrupt = 0

  // ---------- one turn ----------

  async function runPrompt(text: string): Promise<boolean> {
    const before = messages.length
    messages.push({ role: 'user', content: text })
    const ac = (current = new AbortController())
    const t0 = Date.now()
    ui.beginTurn()
    try {
      await runTurn({
        provider,
        system,
        messages,
        cwd,
        permissions,
        signal: ac.signal,
        hooks: {
          onThinking: () => ui.think(),
          onText: (d) => ui.text(d),
          onTextEnd: () => ui.endText(),
          onToolRunning: (n, s) => ui.work(n, s),
          onToolDone: (n, s, ok, r) => ui.toolCard(n, s, ok, r),
          confirm: (n, p) => ui.confirm(n, p),
          onUsage: (u) => ((totals.input += u.input), (totals.output += u.output)),
        },
      })
      ui.done((Date.now() - t0) / 1000)
      return true
    } catch (e: any) {
      if (e instanceof Cancelled) ui.warn('Cancelled.')
      else {
        messages.length = before
        ui.error(e?.message ?? String(e))
      }
      return false
    } finally {
      ui.idle()
      current = undefined
      session.profile = profileName
      saveSession(session)
    }
  }

  function interrupt() {
    const now = Date.now()
    if (current && !current.signal.aborted) {
      current.abort()
      cancelAsk?.()
      lastInterrupt = now
      return
    }
    if (now - lastInterrupt < 2000 || !interactive) {
      ui.idle()
      process.stdout.write('\n')
      process.exit(130)
    }
    lastInterrupt = now
    ui.info('\n(press Ctrl+C again to exit)')
    if (rl) {
      rl.write(null as any, { ctrl: true, name: 'u' })
      rl.prompt()
    }
  }
  process.on('SIGINT', interrupt)

  // ---------- one-shot ----------

  if (!interactive) {
    const ok = await runPrompt(args.prompt)
    rl?.close()
    process.exit(ok ? 0 : 1)
  }

  // ---------- interactive ----------

  const profile = () => cfg!.profiles[profileName]
  const showBanner = () => ui.banner({ version: VERSION, profile: profileName, model: profile().model, cwd })
  await showBanner()

  const reader = getRl()
  reader.setPrompt(theme.accent('› '))
  reader.on('SIGINT', interrupt)

  const status = () => {
    const p = profile()
    const cost = p.inputPerMTok !== undefined || p.outputPerMTok !== undefined
      ? (totals.input * (p.inputPerMTok ?? 0) + totals.output * (p.outputPerMTok ?? 0)) / 1e6
      : undefined
    ui.statusLine({ model: p.model, cwd, input: totals.input, output: totals.output, cost })
  }
  let closed = false
  reader.on('close', () => (closed = true))
  const next = () => {
    if (closed) return
    status()
    reader.prompt()
  }

  const commands: Record<string, (arg: string) => Promise<void> | void> = {
    help: () =>
      ui.line(
        ['/help          show this help', '/model         list profiles; /model <name> switches; /model add adds one', '/clear         start a fresh conversation', '/config        show config location and profiles', '/exit          quit (Ctrl+C twice also works)']
          .map((l) => theme.muted('  ' + l))
          .join('\n'),
      ),
    exit: () => {
      reader.close()
    },
    clear: async () => {
      messages.length = 0
      session = newSession(cwd, profileName)
      totals.input = totals.output = 0
      if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H')
      await showBanner()
    },
    config: () => {
      ui.line(theme.muted(`  config: ${configPath()}`))
      for (const [n, p] of Object.entries(cfg!.profiles)) {
        ui.line(`  ${n === profileName ? theme.accent('●') : ' '} ${n}  ${theme.muted(`${p.type} · ${p.model}${p.baseUrl ? ' · ' + p.baseUrl : ''} · key ${maskKey(p.apiKey)}`)}`)
      }
      ui.line(theme.muted(`  pet: ${cfg!.pet}  animations: ${cfg!.animations}`))
    },
    model: async (arg) => {
      if (arg === 'add') {
        cfg = await setupProfile(ask, cfg!)
        arg = cfg.activeProfile
      }
      if (!arg) {
        for (const [n, p] of Object.entries(cfg!.profiles)) ui.line(`  ${n === profileName ? theme.accent('●') : ' '} ${n}  ${theme.muted(`${p.type} · ${p.model}`)}`)
        return ui.info('  switch with /model <name>')
      }
      if (!cfg!.profiles[arg]) return ui.error(`Unknown profile "${arg}".`)
      try {
        useProfile(arg)
        cfg!.activeProfile = arg
        saveConfig(cfg!)
        ui.info(`  now using ${arg} (${profile().model})`)
      } catch (e: any) {
        ui.error(e.message)
      }
    },
  }

  next()
  for await (const raw of reader) {
    const line = raw.trim()
    if (line.startsWith('/')) {
      const [cmd, ...rest] = line.slice(1).split(/\s+/)
      const fn = commands[cmd]
      if (fn) await fn(rest.join(' '))
      else ui.error(`Unknown command /${cmd}. Try /help.`)
    } else if (line) {
      await runPrompt(line)
    }
    next()
  }
  saveSession(session)
  process.exit(0)
}

main().catch((e) => {
  console.error(theme.error(e?.message ?? String(e)))
  process.exit(1)
})
