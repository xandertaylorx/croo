import readline from 'node:readline'
import pkg from '../package.json' with { type: 'json' }
import { HELP, parseArgs, type Args } from './args.js'
import { runTurn, Cancelled } from './agent.js'
import { DEFAULT_BASE_URLS, configPath, defaultConfig, isLocalUrl, loadConfig, maskKey, resolveApiKey, saveConfig } from './config.js'
import { Permissions } from './permissions.js'
import { buildSystemPrompt } from './prompt.js'
import { demoProvider, DEMO_PROFILE } from './providers/demo.js'
import { createProvider } from './providers/index.js'
import { PRESETS, type Preset } from './providers/presets.js'
import { loadLastSession, newSession, saveSession } from './session.js'
import type { Config, Msg, Profile, Provider } from './types.js'
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

/** Ask the provider which models this key can use; keep the default if it is listed, else pick a chat model. */
async function pickAvailableModel(profile: Profile): Promise<string> {
  const base = (profile.baseUrl ?? DEFAULT_BASE_URLS.openai).replace(/\/+$/, '')
  try {
    const res = await fetch(`${base}/models`, {
      headers: profile.apiKey ? { authorization: `Bearer ${profile.apiKey}` } : {},
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return profile.model
    const ids: string[] = ((await res.json()) as any).data?.map((m: any) => m.id) ?? []
    if (!ids.length || ids.includes(profile.model)) return profile.model
    const chat = ids.filter((id) => !/whisper|tts|guard|embed|moderation|image|dall|audio|transcri|rerank/i.test(id))
    const pick = chat.find((id) => /gpt-oss-120b|llama-3\.3-70b|gpt-4o|large|chat/i.test(id)) ?? chat[0]
    if (pick) {
      console.log(theme.muted(`  ${profile.model} isn't available on this key, using ${pick}.`))
      return pick
    }
  } catch {}
  return profile.model
}

async function askKey(a: Ask, label: string): Promise<string> {
  for (;;) {
    const key = (await a(`Paste your ${label} API key: `, { secret: true })).trim()
    if (key) return key
    if (!process.stdin.isTTY) return ''
    console.log(theme.muted('  (nothing pasted, try again)'))
  }
}

/** Pick a provider from the list, paste a key, done. Returns null if the user chose demo mode. */
export async function setupProfile(a: Ask, cfg: Config, opts: { allowDemo?: boolean } = {}): Promise<Config | null> {
  console.log(theme.bold('\nPick a provider\n'))
  PRESETS.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}) ${p.label}`))
  const otherN = PRESETS.length + 1
  console.log(`  ${String(otherN).padStart(2)}) Other (any OpenAI-compatible URL)`)
  if (opts.allowDemo) console.log(`  ${String(otherN + 1).padStart(2)}) Demo mode (no key)`)
  console.log()

  let preset: Preset | undefined
  let custom = false
  for (;;) {
    const raw = (await a('Number: ')).trim().toLowerCase()
    if (!raw && !process.stdin.isTTY) return null
    const n = Number(raw)
    preset = Number.isInteger(n) ? PRESETS[n - 1] : PRESETS.find((p) => p.id === raw)
    if (preset) break
    if (n === otherN) {
      custom = true
      break
    }
    if (opts.allowDemo && (n === otherN + 1 || raw.startsWith('d'))) return null
    console.log(theme.muted('  Pick a number from the list.'))
  }

  let profile: Profile
  let base: string
  if (custom) {
    let url = ''
    while (!url) {
      url = (await a('Base URL (e.g. https://api.example.com/v1): ')).trim()
      try {
        new URL(url)
      } catch {
        url = ''
      }
    }
    profile = { type: 'openai', baseUrl: url, model: (await a('Model name: ')).trim() || 'gpt-4o' }
    if (!isLocalUrl(url)) profile.apiKey = await askKey(a, new URL(url).hostname)
    base = new URL(url).hostname.replace(/^api\./, '').split('.')[0]
  } else {
    profile = { type: preset!.type, model: preset!.model }
    if (preset!.baseUrl) profile.baseUrl = preset!.baseUrl
    if (!preset!.noKey) profile.apiKey = await askKey(a, preset!.label)
    base = preset!.id
  }

  if (profile.type === 'openai') profile.model = await pickAvailableModel(profile)

  let name = base
  for (let i = 2; cfg.profiles[name]; i++) name = `${base}${i}`
  const next: Config = { ...cfg, profiles: { ...cfg.profiles, [name]: profile }, activeProfile: name }
  saveConfig(next)
  console.log(theme.accent(`\nSaved. Using ${profile.model}. Change it any time with /model.\n`))
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

  let cfg = args.demo ? null : loadConfig()
  if (args.demo) {
    cfg = { ...defaultConfig(), activeProfile: 'demo', profiles: { demo: DEMO_PROFILE } }
  } else if (!cfg || !Object.keys(cfg.profiles).length) {
    if (!process.stdin.isTTY) {
      console.error(`No config found. Run \`croo\` in a terminal to set one up, or create ${configPath()}.`)
      process.exit(1)
    }
    console.log(theme.accent(theme.bold('Welcome to Croo.')))
    const made = await setupProfile(ask, cfg ?? defaultConfig(), { allowDemo: true })
    if (made) cfg = made
    else {
      args.demo = true
      cfg = { ...defaultConfig(), activeProfile: 'demo', profiles: { demo: DEMO_PROFILE } }
    }
  }
  let profileName = args.profile ?? cfg.activeProfile
  if (!cfg.profiles[profileName]) {
    console.error(`Unknown profile "${profileName}". Available: ${Object.keys(cfg.profiles).join(', ')}`)
    process.exit(1)
  }
  // Active profile has no key anywhere: show the provider list again instead of erroring.
  const needsKey = (p: Profile) => !args.demo && !resolveApiKey(p) && !(p.type === 'openai' && isLocalUrl(p.baseUrl))
  if (needsKey(cfg.profiles[profileName]) && process.stdin.isTTY) {
    console.log(theme.muted(`No API key set for "${profileName}".`))
    const { [profileName]: _dropped, ...rest } = cfg.profiles
    const made = await setupProfile(ask, { ...cfg, profiles: rest }, { allowDemo: true })
    if (made) {
      cfg = made
      profileName = cfg.activeProfile
    } else {
      args.demo = true
      cfg = { ...defaultConfig(), activeProfile: 'demo', profiles: { demo: DEMO_PROFILE } }
      profileName = 'demo'
    }
  }

  const ui = new Ui({ theme, pet: frogPet, showPet: cfg.pet && !args.noPet, animations: cfg.animations, ask })
  const permissions = new Permissions(args.yolo)
  const persist = !args.demo // demo mode never touches the config or session files
  const interactive = !args.prompt

  let provider: Provider
  const useProfile = (name: string) => {
    provider = args.demo ? demoProvider() : createProvider(cfg!.profiles[name])
    profileName = name
  }
  try {
    useProfile(profileName)
  } catch (e: any) {
    ui.petSays('oops', e.message)
    process.exit(1)
  }

  let session = (args.continue && !args.demo && loadLastSession(cwd)) || newSession(cwd, profileName)
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
      if (persist) saveSession(session)
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
  if (args.demo) ui.info('Demo mode: a scripted fake model, no API calls. Type anything to start.')

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
        cfg = (await setupProfile(ask, cfg!)) ?? cfg!
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
        if (persist) saveConfig(cfg!)
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
  if (persist) saveSession(session)
  process.exit(0)
}

main().catch((e) => {
  console.error(theme.error(e?.message ?? String(e)))
  process.exit(1)
})
