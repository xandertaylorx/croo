import { PRESETS, type Preset } from '../providers/presets.js'
import { h, icon } from './dom.js'
import { Frog } from './frog.js'
import type { AppState } from '../shared/ipc.js'
import { modelList } from './models.js'
import { croo, store } from './store.js'

type Choice = Preset | 'custom'

/** Pick a provider, paste a key. Used on first run and from Settings. */
function providerSetup(done: () => void, cancel?: () => void): HTMLElement {
  const root = h('div', { class: 'setup' })

  const pick = () => {
    root.replaceChildren(
      h(
        'div',
        { class: 'provider-grid' },
        PRESETS.map((p) => h('button', { class: 'provider', type: 'button', onClick: () => form(p) }, h('span', null, p.label.replace(/ \(.*\)/, '')), p.noKey ? h('small', null, 'local') : null)),
        h('button', { class: 'provider', type: 'button', onClick: () => form('custom') }, h('span', null, 'Other…'), h('small', null, 'any OpenAI-compatible URL')),
      ),
      ...(cancel ? [h('div', { class: 'setup-actions' }, h('button', { class: 'btn ghost', type: 'button', onClick: cancel }, 'Cancel'))] : []),
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
        h('p', { class: 'lede' }, 'A small coding agent with a frog in it. Bring your own API key or a local model. No account, no telemetry.'),
        store.state.configError ? h('p', { class: 'form-error' }, store.state.configError) : null,
        providerSetup(() => {}),
        h('button', { class: 'link', type: 'button', onClick: () => void croo.startDemo() }, 'Just look around (demo, no key)'),
      ),
    ),
  )
}

// ---------- settings ----------

let modal: HTMLElement | null = null
/** Which inline panel is open on each provider card. */
const panels = new Map<string, 'key' | 'models'>()

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

export function openSettings() {
  if (modal) return closeSettings()
  const body = h('div', { class: 'modal-body' })
  const card = h('div', { class: 'modal-card', role: 'dialog', 'aria-label': 'Settings' }, body)
  modal = h('div', { class: 'modal', onClick: (e: Event) => e.target === modal && closeSettings() }, card)
  document.getElementById('modal-root')!.append(modal)
  document.addEventListener('keydown', onKey, true)

  const profileCard = (p: AppState['profiles'][number], demo: boolean) => {
    const panel = panels.get(p.name)
    const toggle = (kind: 'key' | 'models') => {
      panels.get(p.name) === kind ? panels.delete(p.name) : panels.set(p.name, kind)
      list()
    }
    const active = p.active && !demo
    return h(
      'div',
      { class: `pcard ${active ? 'active' : ''} ${p.hasKey ? '' : 'nokey'}` },
      h(
        'div',
        { class: 'pcard-top' },
        h('span', { class: 'pcard-name' }, p.name),
        active ? h('span', { class: 'pill' }, 'Active') : h('button', { class: 'btn small', type: 'button', onClick: () => void croo.useProfile(p.name) }, 'Use'),
        h('span', { class: 'push-right' }),
        h('button', { class: 'icon-btn small danger', type: 'button', title: 'Remove provider', onClick: () => (panels.delete(p.name), void croo.removeProfile(p.name)) }, icon('trash', 14)),
      ),
      h('div', { class: 'pcard-meta' }, h('span', { class: 'mono' }, p.model), h('span', null, p.provider)),
      h(
        'div',
        { class: 'pcard-key' },
        icon('key', 14),
        p.hasKey
          ? h('span', null, p.local && !p.keyHint ? 'Local server, no key needed' : p.keyHint, p.keySource === 'saved' ? h('em', null, store.state.secureKeys ? ' · encrypted in your keychain' : ' · saved on this Mac') : p.keySource === 'env' ? h('em', null, ' · set with an environment variable') : null)
          : h('span', { class: 'warn' }, 'No key yet'),
        h('span', { class: 'push-right' }),
        h('button', { class: `btn small ${panel === 'key' ? 'on' : ''} ${p.hasKey ? '' : 'primary'}`, type: 'button', onClick: () => toggle('key') }, p.hasKey ? 'Update key' : 'Add key'),
        h('button', { class: `btn small ${panel === 'models' ? 'on' : ''}`, type: 'button', disabled: !p.hasKey, onClick: () => toggle('models') }, 'Models'),
      ),
      panel === 'key' ? keyForm(p.name, () => (panels.delete(p.name), list())) : null,
      panel === 'models' ? h('div', { class: 'pcard-models' }, modelList({ profile: p.name, current: p.model, autofocus: true, onPick: (id) => void croo.setModel(p.name, id) })) : null,
    )
  }

  const list = () => {
    redraw = list
    const { profiles, demo, secureKeys } = store.state
    body.replaceChildren(
      h('div', { class: 'modal-head' }, h('h2', null, 'Settings'), h('button', { class: 'icon-btn', type: 'button', title: 'Close', onClick: closeSettings }, icon('x', 16))),
      h('div', { class: 'section-label' }, 'Providers'),
      profiles.length || demo
        ? h(
            'div',
            { class: 'profiles' },
            demo ? h('div', { class: 'pcard active' }, h('div', { class: 'pcard-top' }, h('span', { class: 'pcard-name' }, 'Demo'), h('span', { class: 'pill' }, 'Active')), h('div', { class: 'pcard-meta' }, h('span', null, 'A scripted fake model. Nothing is saved.'))) : null,
            profiles.map((p) => profileCard(p, demo)),
          )
        : h('p', { class: 'muted' }, 'No providers yet.'),
      h('button', { class: 'btn', type: 'button', onClick: add }, icon('plus', 14), 'Add provider'),
      h('div', { class: 'section-label' }, 'Project instructions'),
      h('p', { class: 'muted' }, 'Croo reads AGENTS.md, CLAUDE.md and CROO.md in each folder at the start of every turn. Type ', h('kbd', null, '/init'), ' in a chat and it will study the project and write AGENTS.md for you.'),
      h('div', { class: 'section-label' }, 'Privacy'),
      h('p', { class: 'muted' }, secureKeys ? 'Your API keys are encrypted with your Mac’s keychain before they are written to disk. ' : 'Your API keys are saved in ~/.config/croo (readable only by you). ', 'Chats and folders stay in ~/.local/share/croo. The only network calls are to the model provider you choose.'),
    )
  }
  const add = () => {
    redraw = undefined
    body.replaceChildren(
      h('div', { class: 'modal-head' }, h('h2', null, 'Add provider')),
      providerSetup(() => list(), list),
    )
  }
  list()
}

let redraw: (() => void) | undefined

/** The provider list follows state changes (switching, removing, updating a key) while the sheet is open. */
export function refreshSettings() {
  if (modal) redraw?.()
}
