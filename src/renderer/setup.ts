import { PRESETS, type Preset } from '../providers/presets.js'
import { SUBSCRIPTIONS } from '../subscriptions/info.js'
import { h, icon } from './dom.js'
import { Frog } from './frog.js'
import type { AppState, McpServerInfo, PermissionMode } from '../shared/ipc.js'
import type { Effort } from '../effort.js'
import { modelList } from './models.js'
import type { IconName } from './dom.js'
import { applyFont, applyMode, applyPalette, croo, FONTS, installUpdate, MODES, onUpdateProgress, PALETTES, remember, store, updateProgress } from './store.js'

type Choice = Preset | 'custom'

const gb = (n: number) => `${(n / 1e9).toFixed(1)} GB`
/** Download a model that Croo runs itself, on this Mac, with no account or key. */
const localCardList = () =>
  store.state.localModels.map((l) => {
      const action =
        l.status === 'ready'
          ? l.active
            ? h('span', { class: 'pill' }, 'Active')
            : h('button', { class: 'btn small primary', type: 'button', onClick: () => void croo.useLocal(l.id) }, 'Use')
          : l.status === 'downloading'
            ? h('button', { class: 'btn small', type: 'button', onClick: () => void croo.cancelLocal(l.id) }, 'Pause')
            : h('button', { class: 'btn small primary', type: 'button', disabled: !store.state.engine, onClick: () => void croo.downloadLocal(l.id) }, l.progress ? 'Resume' : `Download · ${gb(l.bytes)}`)
      return h(
        'div',
        { class: `pcard local ${l.active ? 'active' : ''}` },
        h('div', { class: 'pcard-top' }, h('div', { class: 'pcard-id' }, h('span', { class: 'pcard-name' }, l.name, h('span', { class: 'pill soft' }, 'On this Mac')), h('span', { class: 'pcard-host' }, 'Free, private, works offline. Saved in Croo’s data folder, so app updates never remove it.')), h('span', { class: 'push-right' }), action, l.status === 'ready' ? h('button', { class: 'icon-btn small danger', type: 'button', title: 'Delete the downloaded model', onClick: () => void croo.deleteLocal(l.id) }, icon('trash', 14)) : null),
        h('p', { class: 'muted' }, l.blurb, l.fits ? '' : ' This Mac may not have enough memory for it.'),
        l.status === 'downloading' ? h('div', { class: 'meter' }, h('div', { class: 'meter-fill', style: `width:${Math.round(l.progress * 100)}%` }), h('small', null, `${gb(l.progress * l.bytes)} of ${gb(l.bytes)}`)) : null,
        l.error ? h('p', { class: 'form-error' }, l.error) : null,
        !store.state.engine ? h('p', { class: 'form-error' }, 'The local engine is not part of this build. Run npm run engine, then restart.') : null,
      )
    })

/** The model-download cards; kept live while a download runs, even on the first-run screen. */
export function localCards(): HTMLElement {
  const el = h('div', { class: 'local-cards' })
  el.replaceChildren(...localCardList())
  return el
}

export function refreshLocalCards() {
  document.querySelectorAll('.local-cards').forEach((el) => el.replaceChildren(...localCardList()))
}

/** Pick a provider, paste a key. Used on first run and from Settings. */
function providerSetup(done: () => void, cancel?: () => void): HTMLElement {
  const root = h('div', { class: 'setup' })

  const pick = () => {
    root.replaceChildren(
      h(
        'div',
        { class: 'provider-grid' },
        PRESETS.map((p) => h('button', { class: 'provider', type: 'button', onClick: () => (p.subscription ? subscription(p) : form(p)) }, h('span', null, p.label.replace(/ \(.*\)/, '')), p.subscription ? h('small', null, 'no key') : p.noKey ? h('small', null, 'local') : null)),
        h('button', { class: 'provider', type: 'button', onClick: () => form('custom') }, h('span', null, 'Other…'), h('small', null, 'any OpenAI-compatible URL')),
      ),
      ...(cancel ? [h('div', { class: 'setup-actions' }, h('button', { class: 'btn ghost', type: 'button', onClick: cancel }, 'Cancel'))] : []),
    )
  }

  /** Sign in with a subscription: the CLI you already use runs the agent, so there is nothing to paste. */
  const subscription = (p: Preset) => {
    const info = SUBSCRIPTIONS[p.type as 'claude-code' | 'codex']
    const status = h('p', { class: 'sub-status' }, h('span', { class: 'spinner' }), 'Checking…')
    const error = h('p', { class: 'form-error', role: 'alert' })
    const go = h('button', { class: 'btn primary', type: 'submit', disabled: true }, 'Use my subscription')
    const refresh = async () => {
      const st = (await croo.subscriptionStatus()).find((x) => x.id === p.type)
      const ok = !!st?.signedIn
      status.className = `sub-status ${ok ? 'ok' : 'bad'}`
      status.replaceChildren(icon(ok ? 'check' : 'x', 14), h('span', null, ok ? `${info.binary}${st?.version ? ` ${st.version}` : ''} is installed and signed in${st?.account ? ` (${st.account})` : ''}.` : (st?.problem ?? 'Could not check.')))
      go.disabled = !ok
    }
    void refresh()
    root.replaceChildren(
      h(
        'form',
        {
          class: 'setup-form',
          onSubmit: async (e: Event) => {
            e.preventDefault()
            go.disabled = true
            go.textContent = 'Connecting…'
            const res = await croo.addProfile({ presetId: p.id })
            if (res.ok) return done()
            error.textContent = res.error
            go.disabled = false
            go.textContent = 'Use my subscription'
          },
        },
        h('div', { class: 'setup-title' }, info.label),
        h('small', null, `Runs the ${info.binary} command with your ${info.plan} plan. No API key: usage counts against your plan, and Croo never sees your login.`),
        status,
        error,
        h('div', { class: 'setup-actions' }, h('button', { class: 'btn ghost', type: 'button', onClick: pick }, 'Back'), h('button', { class: 'btn ghost', type: 'button', onClick: () => void refresh() }, 'Check again'), go),
      ),
    )
  }

  const form = (choice: Choice) => {
    const custom = choice === 'custom'
    const needsKey = custom || !(choice as Preset).noKey
    const url = h('input', { class: 'input', placeholder: 'https://api.example.com/v1', spellcheck: 'false', autocapitalize: 'off' })
    const model = h('input', { class: 'input', placeholder: custom ? 'Model name' : (choice as Preset).model, spellcheck: 'false', autocapitalize: 'off' })
    const key = h('input', { class: 'input', type: 'password', placeholder: custom ? 'API key (optional for local servers)' : 'Paste your API key', spellcheck: 'false', autocomplete: 'off' })
    const error = h('p', { class: 'form-error', role: 'alert' })
    const go = h('button', { class: 'btn primary', type: 'submit' }, needsKey ? 'Connect' : 'Use local model')

    const submit = async (e: Event) => {
      e.preventDefault()
      error.textContent = ''
      go.disabled = true
      go.textContent = 'Checking…'
      const res = await croo.addProfile({
        presetId: custom ? undefined : (choice as Preset).id,
        baseUrl: url.value,
        model: model.value,
        apiKey: key.value,
      })
      if (res.ok) return done()
      error.textContent = res.error
      go.disabled = false
      go.textContent = needsKey ? 'Connect' : 'Use local model'
    }

    root.replaceChildren(
      h(
        'form',
        { class: 'setup-form', onSubmit: submit },
        h('div', { class: 'setup-title' }, custom ? 'Any OpenAI-compatible API' : (choice as Preset).label),
        custom ? h('label', null, h('span', null, 'Base URL'), url) : null,
        needsKey ? h('label', null, h('span', null, 'API key'), key, h('small', null, 'Stored only on this Mac, in ~/.config/croo. Sent only to this provider.')) : h('small', null, `Talks to ${(choice as Preset).baseUrl} on your machine. Make sure it is running.`),
        h('label', null, h('span', null, 'Model'), model, custom ? null : h('small', null, 'Leave blank to use the default.')),
        error,
        h('div', { class: 'setup-actions' }, h('button', { class: 'btn ghost', type: 'button', onClick: pick }, 'Back'), go),
      ),
    )
    ;(custom ? url : needsKey ? key : model).focus()
  }

  pick()
  return root
}

/** Shown in the main pane until a provider is set up. */
export function renderOnboarding(root: HTMLElement) {
  root.replaceChildren(
    h(
      'section',
      { class: 'onboarding' },
      h('div', { class: 'chat-head drag' }),
      h(
        'div',
        { class: 'onboarding-body' },
        new Frog(168).el,
        h('h1', null, 'Welcome to Croo'),
        h('p', { class: 'lede' }, 'A small coding agent with a frog in it. Bring your own API key, a Claude or ChatGPT subscription, or a local model. No account, no telemetry.'),
        store.state.configError ? h('p', { class: 'form-error' }, store.state.configError) : null,
        h('div', { class: 'hero-local' }, h('h2', null, 'Start free, on this Mac'), localCards()),
        h('p', { class: 'or-line' }, 'or connect a provider'),
        providerSetup(() => {}),
        h('button', { class: 'link', type: 'button', onClick: () => void croo.startDemo() }, 'Just look around (demo, no key)'),
      ),
    ),
  )
}

// ---------- settings ----------

let modal: HTMLElement | null = null
/** Which inline panel is open on each provider card. */
const panels = new Map<string, 'key' | 'models' | 'price'>()

export function closeSettings() {
  modal?.remove()
  modal = null
  document.removeEventListener('keydown', onKey, true)
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.stopPropagation()
    closeSettings()
  }
}

function keyForm(name: string, close: () => void): HTMLElement {
  const input = h('input', { class: 'input', type: 'password', placeholder: 'Paste the new API key', spellcheck: 'false', autocomplete: 'off' })
  const error = h('p', { class: 'form-error', role: 'alert' })
  const save = h('button', { class: 'btn primary', type: 'submit' }, 'Verify & save')
  requestAnimationFrame(() => input.focus())
  return h(
    'form',
    {
      class: 'inline-form',
      onSubmit: async (e: Event) => {
        e.preventDefault()
        error.textContent = ''
        save.disabled = true
        save.textContent = 'Checking…'
        const res = await croo.updateKey(name, input.value)
        if (res.ok) return close()
        error.textContent = res.error
        save.disabled = false
        save.textContent = 'Verify & save'
      },
    },
    h('div', { class: 'inline-row' }, input, save, h('button', { class: 'btn ghost', type: 'button', onClick: close }, 'Cancel')),
    error,
  )
}

type Pane = 'providers' | 'general' | 'mcp' | 'memory' | 'about'
let pane: Pane = 'providers'

const MODE_OPTIONS: { id: PermissionMode; label: string; icon: IconName; desc: string }[] = [
  { id: 'manual', label: 'Manual', icon: 'shield', desc: 'Asks before every action, even reading a file.' },
  { id: 'auto', label: 'Auto', icon: 'shieldCheck', desc: 'Reads, edits in the folder and safe commands run. Anything else asks.' },
  { id: 'plan', label: 'Plan', icon: 'map', desc: 'Researches without changing anything, then asks you to approve a plan.' },
  { id: 'bypass', label: 'Bypass', icon: 'bolt', desc: 'Never asks. Commands run immediately.' },
]
const EFFORT_OPTIONS: { id: Effort; label: string }[] = [
  { id: 'auto', label: 'Auto' }, { id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }, { id: 'xhigh', label: 'Extra high' }, { id: 'max', label: 'Max' },
]
const SHORTCUTS: [string, string][] = [
  ['⌘1 / ⌘2', 'Chat / Code mode'], ['⌘N', 'New chat'], ['⌘O', 'Add folder'], ['⌘B', 'Toggle sidebar'], ['⌘J', 'Terminal'], ['⌘T', 'New terminal tab (in terminal)'],
  ['⌘⇧E', 'Files'], ['⌘⇧G', 'Git'], ['⌘⇧B', 'Browser'], ['⇧Tab', 'Cycle permission mode'], ['⌘↵', 'Allow an approval'], ['⌘,', 'Settings'],
]

function priceForm(p: AppState['profiles'][number], close: () => void): HTMLElement {
  const num = (v?: number) => h('input', { class: 'input small', type: 'number', min: '0', step: '0.01', placeholder: '0.00', value: v === undefined ? '' : String(v), 'aria-label': 'Dollars per million tokens' })
  const input = num(p.price?.source === 'custom' ? p.price.input : undefined)
  const output = num(p.price?.source === 'custom' ? p.price.output : undefined)
  const save = () => {
    const i = parseFloat(input.value)
    const o = parseFloat(output.value)
    void croo.setPrice(p.name, Number.isFinite(i) ? i : undefined, Number.isFinite(o) ? o : undefined).then(close)
  }
  return h(
    'div',
    { class: 'inline-form' },
    h('div', { class: 'inline-row price-row' }, h('label', null, h('span', null, 'Input $ / 1M'), input), h('label', null, h('span', null, 'Output $ / 1M'), output)),
    h('p', { class: 'muted' }, 'Used for the cost estimate under each reply. Claude list prices are built in; set your own for other providers. Leave both empty to reset.'),
    h('div', { class: 'inline-row' }, h('button', { class: 'btn primary', type: 'button', onClick: save }, 'Save'), h('button', { class: 'btn ghost', type: 'button', onClick: close }, 'Cancel')),
  )
}

export function openSettings() {
  if (modal) return closeSettings()
  const content = h('div', { class: 'settings-pane' })
  const nav = h('nav', { class: 'settings-nav', 'aria-label': 'Settings sections' })
  const card = h('div', { class: 'modal-card wide', role: 'dialog', 'aria-label': 'Settings' }, h('div', { class: 'settings' }, nav, content), h('button', { class: 'icon-btn settings-close', type: 'button', title: 'Close (Esc)', onClick: closeSettings }, icon('x', 16)))
  modal = h('div', { class: 'modal settings-modal', onClick: (e: Event) => e.target === modal && closeSettings() }, card)
  document.getElementById('modal-root')!.append(modal)
  document.addEventListener('keydown', onKey, true)

  const head = (title: string, sub?: string) =>
    h('div', { class: 'pane-head' }, h('div', null, h('h2', null, title), sub ? h('p', { class: 'muted' }, sub) : null))

  const profileCard = (p: AppState['profiles'][number], demo: boolean) => {
    const open = panels.get(p.name)
    const toggle = (kind: 'key' | 'models' | 'price') => {
      panels.get(p.name) === kind ? panels.delete(p.name) : panels.set(p.name, kind)
      paint()
    }
    const active = p.active && !demo
    return h(
      'div',
      { class: `pcard ${active ? 'active' : ''} ${p.hasKey ? '' : 'nokey'}` },
      h(
        'div',
        { class: 'pcard-top' },
        h('div', { class: 'pcard-id' }, h('span', { class: 'pcard-name' }, p.name), h('span', { class: 'pcard-host' }, p.provider)),
        h('span', { class: 'push-right' }),
        active ? h('span', { class: 'pill' }, 'Active') : h('button', { class: 'btn small', type: 'button', onClick: () => void croo.useProfile(p.name) }, 'Use'),
        h('button', { class: 'icon-btn small danger', type: 'button', title: 'Remove provider', onClick: () => (panels.delete(p.name), void croo.removeProfile(p.name)) }, icon('trash', 14)),
      ),
      h('div', { class: 'pcard-row' }, h('span', { class: 'pcard-label' }, 'Model'), h('span', { class: 'mono pcard-val' }, p.model), h('button', { class: `btn small ${open === 'models' ? 'on' : ''}`, type: 'button', disabled: !p.hasKey, onClick: () => toggle('models') }, 'Change')),
      ...(p.subscription
        ? [
            h('div', { class: 'pcard-row' }, h('span', { class: 'pcard-label' }, 'Sign-in'), h('span', { class: 'pcard-val' }, `Your ${p.subscription === 'codex' ? 'codex' : 'claude'} login`, h('em', null, ` · change it with ${SUBSCRIPTIONS[p.subscription].login}`))),
            h('div', { class: 'pcard-row' }, h('span', { class: 'pcard-label' }, 'Price'), h('span', { class: 'pcard-val' }, 'Included in your plan', h('em', null, ' · counts against its usage limits'))),
          ]
        : [h(
        'div',
        { class: 'pcard-row' },
        h('span', { class: 'pcard-label' }, 'API key'),
        p.hasKey
          ? h('span', { class: 'pcard-val' }, p.local && !p.keyHint ? 'Not needed for a local server' : p.keyHint, p.keySource === 'saved' ? h('em', null, store.state.secureKeys ? ' · encrypted in your keychain' : ' · saved on this Mac') : p.keySource === 'env' ? h('em', null, ' · from an environment variable') : null)
          : h('span', { class: 'pcard-val warn' }, 'No key yet'),
        h('button', { class: `btn small ${open === 'key' ? 'on' : ''} ${p.hasKey ? '' : 'primary'}`, type: 'button', onClick: () => toggle('key') }, p.hasKey ? 'Update' : 'Add key'),
      ),
      h(
        'div',
        { class: 'pcard-row' },
        h('span', { class: 'pcard-label' }, 'Price'),
        h('span', { class: 'pcard-val' }, p.price ? (p.price.source === 'local' ? 'Free (local server)' : `$${p.price.input} in · $${p.price.output} out per 1M tokens`) : 'Unknown', p.price && p.price.source !== 'local' ? h('em', null, p.price.source === 'custom' ? ' · yours' : ' · list price') : null),
        h('button', { class: `btn small ${open === 'price' ? 'on' : ''}`, type: 'button', onClick: () => toggle('price') }, p.price?.source === 'custom' ? 'Edit' : 'Set'),
      )]),
      open === 'key' && !p.subscription ? keyForm(p.name, () => (panels.delete(p.name), paint())) : null,
      open === 'price' && !p.subscription ? priceForm(p, () => (panels.delete(p.name), paint())) : null,
      open === 'models' ? h('div', { class: 'pcard-models' }, modelList({ profile: p.name, current: p.model, autofocus: true, onPick: (id) => void croo.setModel(p.name, id) })) : null,
    )
  }

  const providersPane = () => {
    const { demo } = store.state
    const profiles = store.state.profiles.filter((p) => !p.engine)
    return [
      head('Providers', 'Where Croo sends your messages. Run a model on this Mac, bring your own key, or point it at a local server.'),
      localCards(),
      profiles.length || demo
        ? h(
            'div',
            { class: 'profiles' },
            demo ? h('div', { class: 'pcard active' }, h('div', { class: 'pcard-top' }, h('div', { class: 'pcard-id' }, h('span', { class: 'pcard-name' }, 'Demo'), h('span', { class: 'pcard-host' }, 'scripted, nothing is saved')), h('span', { class: 'push-right' }), h('span', { class: 'pill' }, 'Active'))) : null,
            profiles.map((p) => profileCard(p, demo)),
          )
        : h('p', { class: 'muted' }, 'No providers yet.'),
      h('button', { class: 'btn', type: 'button', onClick: addProvider }, icon('plus', 14), 'Add provider'),
    ]
  }

  /** Square, downscaled copy of the chosen picture so the config stays small. */
  const toAvatar = (file: File) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onerror = () => resolve('')
      reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const size = Math.min(img.width, img.height)
        const c = document.createElement('canvas')
        c.width = c.height = 160
        c.getContext('2d')!.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 160, 160)
        resolve(c.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => resolve('')
      img.src = String(reader.result)
      }
      reader.readAsDataURL(file)
    })

  const profileRow = () => {
    const s = store.state
    const name = h('input', { class: 'input', type: 'text', placeholder: 'Your name', maxlength: 40, value: s.userName, 'aria-label': 'Your name' })
    name.addEventListener('change', () => void croo.setUser(name.value, store.state.avatar))
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true })
    file.addEventListener('change', async () => {
      const f = file.files?.[0]
      const pic = f ? await toAvatar(f) : ''
      if (pic) await croo.setUser(name.value, pic)
    })
    return h(
      'div',
      { class: 'profile-row' },
      s.avatar ? h('img', { class: 'avatar big', src: s.avatar, alt: '' }) : h('span', { class: 'avatar big blank' }, (s.userName || 'U').slice(0, 1).toUpperCase()),
      h('div', { class: 'profile-fields' }, name, h('div', { class: 'profile-btns' }, h('button', { class: 'btn small', type: 'button', onClick: () => file.click() }, s.avatar ? 'Change picture' : 'Choose picture'), s.avatar ? h('button', { class: 'btn small', type: 'button', onClick: () => void croo.setUser(name.value, '') }, 'Remove') : null, file)),
    )
  }

  const memorySection = () => {
    const st = store.state
    const sw = h('input', { class: 'switch', type: 'checkbox', role: 'switch', onChange: (e: Event) => void croo.setMemory((e.target as HTMLInputElement).checked) })
    sw.checked = st.memory
    return h(
      'div',
      null,
      h('label', { class: 'switch-row' }, h('span', null, 'Let Croo remember things about me', h('small', null, 'In Chat mode it saves what seems important and uses it in later chats. Stored in memory.md on this Mac.')), sw),
      st.memoryEntries.length
        ? h(
            'div',
            { class: 'memory-list' },
            st.memoryEntries.map((e, i) =>
              h('div', { class: 'memory-item' }, h('span', { class: 'memory-text' }, e.text), h('small', null, e.date), h('button', { class: 'row-btn show', type: 'button', title: 'Forget this', onClick: () => void croo.removeMemory(i) }, icon('x', 13))),
            ),
            h('button', { class: 'btn small', type: 'button', onClick: () => void croo.clearMemory() }, 'Forget everything'),
          )
        : h('p', { class: 'muted' }, st.memory ? 'Nothing remembered yet.' : 'Memory is off. Croo won’t save or use notes.'),
    )
  }

  const mcpCard = (s: McpServerInfo) => {
    const sw = h('input', { class: 'switch', type: 'checkbox', role: 'switch', title: s.disabled ? 'Turn on' : 'Turn off', onChange: (e: Event) => void croo.mcpToggle(s.name, (e.target as HTMLInputElement).checked) })
    sw.checked = !s.disabled
    const state = s.disabled ? 'Off' : s.status === 'ready' ? `${s.tools.length} tool${s.tools.length === 1 ? '' : 's'}` : s.status === 'connecting' ? 'Connecting…' : s.status === 'error' ? 'Failed' : 'Off'
    return h(
      'div',
      { class: `pcard mcp-card ${s.status}` },
      h(
        'div',
        { class: 'pcard-top' },
        h('div', { class: 'pcard-id' }, h('span', { class: 'pcard-name' }, s.name), h('span', { class: `pill mcp-${s.disabled ? 'off' : s.status}` }, state)),
        h('span', { class: 'push-right' }),
        s.status === 'error' || s.status === 'ready' ? h('button', { class: 'icon-btn small', type: 'button', title: 'Reconnect', onClick: () => void croo.mcpRestart(s.name) }, icon('refresh', 14)) : null,
        sw,
        h('button', { class: 'icon-btn small danger', type: 'button', title: 'Remove server', onClick: () => void croo.mcpRemove(s.name) }, icon('trash', 14)),
      ),
      h('div', { class: 'pcard-row' }, h('span', { class: 'pcard-label' }, s.transport === 'http' ? 'URL' : 'Command'), h('span', { class: 'mono pcard-val', title: s.target }, s.target)),
      s.error ? h('p', { class: 'form-error' }, s.error) : null,
      s.tools.length ? h('p', { class: 'muted mcp-tools' }, s.tools.join(' · ')) : null,
    )
  }

  const mcpPane = () => {
    const servers = store.state.mcpServers
    const text = h('textarea', {
      class: 'input mono mcp-input',
      rows: 5,
      spellcheck: 'false',
      placeholder: 'npx -y @modelcontextprotocol/server-filesystem ~/Documents\nhttps://mcp.example.com/mcp\n{"mcpServers": {"github": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": {"GITHUB_TOKEN": "…"}}}}',
    }) as HTMLTextAreaElement
    const name = h('input', { class: 'input', placeholder: 'Name (optional)', spellcheck: 'false' }) as HTMLInputElement
    const err = h('p', { class: 'form-error' })
    const add = async () => {
      err.textContent = ''
      const r = await croo.mcpAdd(text.value, name.value)
      if (!r.ok) err.textContent = r.error
      else (text.value = ''), (name.value = '')
    }
    return [
      head('MCP servers', 'Give the agent tools from other apps and services, in Code mode.'),
      servers.length ? h('div', { class: 'profiles' }, servers.map(mcpCard)) : h('p', { class: 'muted' }, 'No servers yet.'),
      h('div', { class: 'section-label' }, 'Add a server'),
      h('p', { class: 'muted' }, 'Paste a command, a URL, or the JSON from a server’s README (the usual "mcpServers" format works, so you can copy it from Claude, Cursor or VS Code settings).'),
      text,
      h('div', { class: 'mcp-add' }, name, h('button', { class: 'btn primary', type: 'button', onClick: () => void add() }, 'Add')),
      err,
      h('p', { class: 'muted' }, 'Servers run on this Mac with your permissions, so add only ones you trust. Tokens in "env" and "headers" are ', store.state.secureKeys ? 'encrypted with your keychain.' : 'saved in ~/.config/croo.', ' In Auto mode Croo asks before each MCP tool call unless the server marks the tool read-only.'),
    ]
  }

  const memoryPane = () => [head('Memory', 'What Croo remembers about you between chats.'), memorySection()]

  const voiceRow = () => {
    const v = store.state.voice
    const action = !v.engine
      ? h('span', { class: 'muted' }, 'Not in this build')
      : v.status === 'ready'
        ? h('span', { class: 'pill' }, 'Ready')
        : v.status === 'downloading'
          ? h('span', { class: 'muted' }, `${Math.round(v.progress * 100)}%`)
          : h('button', { class: 'btn small primary', type: 'button', onClick: () => void croo.downloadVoice() }, `Download · ${Math.round(v.bytes / 1e6)} MB`)
    return h('div', { class: 'switch-row' }, h('span', null, 'Dictate with the mic button', h('small', null, 'Speech is turned into text on this Mac with Whisper. Nothing is uploaded.')), action, v.error ? h('p', { class: 'form-error' }, v.error) : null)
  }

  const generalPane = () => {
    const s = store.state
    const active = s.profiles.find((p) => p.active)
    const notifySwitch = h('input', { class: 'switch', type: 'checkbox', role: 'switch', onChange: (e: Event) => void croo.setNotify((e.target as HTMLInputElement).checked) })
    notifySwitch.checked = s.notify
    const diagSwitch = h('input', { class: 'switch', type: 'checkbox', role: 'switch', onChange: (e: Event) => void croo.setDiagnostics((e.target as HTMLInputElement).checked) })
    diagSwitch.checked = s.diagnostics
    const row = (title: string, sub: string | null, control: HTMLElement) => h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', null, title), sub ? h('small', null, sub) : null), control)
    return [
      head('General', 'Defaults for every chat.'),
      h('div', { class: 'section-label' }, 'Appearance'),
      palettePicker(),
      h('div', { class: 'group' }, row('Mode', 'Follow your Mac, or stay light or dark.', modeControl()), row('Font', 'The typeface for Croo’s text. Code stays monospaced.', fontSelect())),
      h('div', { class: 'section-label' }, 'Profile'),
      profileRow(),
      h('div', { class: 'section-label' }, 'Permissions'),
      h(
        'div',
        { class: 'opts' },
        MODE_OPTIONS.map((o) =>
          h('button', { class: `opt mode-${o.id} ${s.permissionMode === o.id ? 'on' : ''}`, type: 'button', role: 'radio', 'aria-checked': s.permissionMode === o.id, onClick: () => void croo.setMode(o.id) }, icon(o.icon, 18), h('b', null, o.label), h('small', null, o.desc)),
        ),
      ),
      h('div', { class: 'section-label' }, 'Reasoning effort'),
      h(
        'div',
        { class: 'chips' },
        EFFORT_OPTIONS.map((o) => h('button', { class: `chipbtn ${s.effort === o.id ? 'on' : ''}`, type: 'button', role: 'radio', 'aria-checked': s.effort === o.id, onClick: () => void croo.setEffort(o.id) }, o.label)),
      ),
      h('p', { class: 'muted' }, active?.efforts.length ? `${active.model} accepts ${active.efforts.join(', ')}. Higher levels think longer and cost more.` : 'The current model has no effort setting. The choice applies to models that do.'),
      h('div', { class: 'section-label' }, 'Behaviour'),
      h(
        'div',
        { class: 'group' },
        row('Check files after edits', 'Runs the project’s TypeScript compiler, or a syntax check for JavaScript, Python, JSON and Go, and tells Croo about errors right away.', diagSwitch),
        row('Notifications', 'Tell me when a task finishes or needs my OK, while Croo is in the background.', notifySwitch),
      ),
      h('div', { class: 'section-label' }, 'Voice input'),
      voiceRow(),
    ]
  }

  const palettePicker = () => {
    const row = h('div', { class: 'palettes', role: 'radiogroup', 'aria-label': 'Colour palette' })
    const paintPalettes = () => {
      const cur = remember.get('palette') ?? 'default'
      row.replaceChildren(
        ...PALETTES.map((p) =>
          h(
            'button',
            { class: `palette ${cur === p.id ? 'on' : ''}`, type: 'button', role: 'radio', 'aria-checked': cur === p.id, onClick: () => (applyPalette(p.id), paintPalettes()) },
            h('span', { class: 'swatches' }, p.swatch.map((c) => h('i', { style: `background:${c}` }))),
            h('b', null, p.label),
            h('small', null, p.note),
          ),
        ),
      )
    }
    paintPalettes()
    return row
  }

  const modeControl = () => {
    const seg = h('div', { class: 'seg-ctl', role: 'radiogroup' })
    const paintMode = () => {
      const cur = remember.get('mode') ?? 'system'
      seg.replaceChildren(...MODES.map((m) => h('button', { class: cur === m.id ? 'on' : '', type: 'button', role: 'radio', 'aria-checked': cur === m.id, onClick: () => (applyMode(m.id), paintMode()) }, m.label)))
    }
    paintMode()
    return seg
  }

  const fontSelect = () => {
    const sel = h('select', { class: 'input select', 'aria-label': 'Font', onChange: () => applyFont(sel.value) }, FONTS.map((f) => h('option', { value: f.id }, f.label)))
    sel.value = remember.get('font') ?? 'default'
    return sel
  }

  const updateRow = () => {
    const u = store.state.update
    const status = h('span', { class: 'muted' }, u ? `Version ${u.version} is available.` : 'You are on the latest version.')
    const btn = h('button', { class: 'btn small', type: 'button' }, u ? (u.zip ? 'Update and restart' : 'Download') : 'Check for updates')
    btn.addEventListener('click', async () => {
      if (u) {
        btn.disabled = true
        if (!u.zip) status.textContent = 'Opening download…'
        const err = await installUpdate()
        btn.disabled = false
        status.textContent = err ?? `Version ${u.version} is available.`
        return
      }
      btn.disabled = true
      status.textContent = 'Checking…'
      const r = await croo.checkUpdate()
      btn.disabled = false
      status.textContent = !r.ok ? r.error : r.update ? `Version ${r.update.version} is available.` : 'You are on the latest version.'
      if (r.ok && r.update) paint()
    })
    const fill = h('div', { class: 'update-fill' })
    const row = h('div', { class: 'update-row' }, status, btn, fill)
    const show = () => {
      const p = updateProgress
      if (!u || !p) return
      btn.disabled = true
      status.textContent = p.text
      fill.style.width = p.fraction !== undefined ? `${p.fraction * 100}%` : '0'
      fill.classList.toggle('indeterminate', p.fraction === undefined)
    }
    show()
    const stop = onUpdateProgress(() => (row.isConnected ? show() : stop()))
    return row
  }

  const aboutPane = () => {
    const s = store.state
    return [
      head('About', `Croo ${s.version}`),
      updateRow(),
      h('div', { class: 'section-label' }, 'Privacy'),
      h('p', { class: 'muted' }, s.secureKeys ? 'API keys are encrypted with your Mac’s keychain before they are written to disk. ' : 'API keys are saved in ~/.config/croo, readable only by you. ', 'Chats and folders stay in ~/.local/share/croo. The only network calls are to the model provider you choose.'),
      h('div', { class: 'section-label' }, 'Project instructions'),
      h('p', { class: 'muted' }, 'Croo reads AGENTS.md, CLAUDE.md and CROO.md in each folder at the start of every turn. Type ', h('kbd', null, '/init'), ' in a chat and it will study the project and write AGENTS.md for you.'),
      h('div', { class: 'section-label' }, 'Keyboard shortcuts'),
      h('div', { class: 'shortcuts' }, SHORTCUTS.map(([k, d]) => h('div', { class: 'sc' }, h('span', null, d), h('span', { class: 'sc-keys' }, (k.match(/⌘|⇧|⌥|⌃|↵|\/|[A-Za-z0-9,]+/g) ?? []).map((t) => (t === '/' ? h('i', null, '/') : h('kbd', null, t))))))),      h('div', { class: 'built-by' }, 'Built by ', h('button', { class: 'crooli-link', type: 'button', title: 'crooli.com', onClick: () => void croo.openExternal('https://crooli.com') }, 'Crooli')),
    ]
  }

  const paint = () => {
    redraw = paint
    const tabs: [Pane, string, IconName][] = [['providers', 'Providers', 'key'], ['general', 'General', 'gear'], ['mcp', 'MCP', 'plug'], ['memory', 'Memory', 'sparkle'], ['about', 'About', 'file']]
    nav.replaceChildren(
      h('div', { class: 'settings-title' }, 'Settings'),
      ...tabs.map(([id, label, ic]) => h('button', { class: `nav-btn ${pane === id ? 'on' : ''}`, type: 'button', 'aria-current': pane === id ? 'page' : undefined, onClick: () => ((pane = id), paint()) }, icon(ic, 16), label)),
      h('span', { class: 'push-down' }),
      h('div', { class: 'settings-ver' }, `Croo ${store.state.version}`),
    )
    content.replaceChildren(...(pane === 'providers' ? providersPane() : pane === 'general' ? generalPane() : pane === 'mcp' ? mcpPane() : pane === 'memory' ? memoryPane() : aboutPane()))
  }

  const addProvider = () => {
    redraw = undefined
    content.replaceChildren(head('Add provider'), providerSetup(() => paint(), paint))
  }
  paint()
}

let redraw: (() => void) | undefined

/** The provider list follows state changes (switching, removing, updating a key) while the sheet is open. */
export function refreshSettings() {
  if (modal) redraw?.()
}
