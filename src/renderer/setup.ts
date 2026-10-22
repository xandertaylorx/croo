import { PRESETS, type Preset } from '../providers/presets.js'
import { h, icon } from './dom.js'
import { Frog } from './frog.js'
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
        new Frog(96).el,
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

export function openSettings() {
  if (modal) return closeSettings()
  const body = h('div', { class: 'modal-body' })
  const card = h('div', { class: 'modal-card', role: 'dialog', 'aria-label': 'Settings' }, body)
  modal = h('div', { class: 'modal', onClick: (e: Event) => e.target === modal && closeSettings() }, card)
  document.getElementById('modal-root')!.append(modal)
  document.addEventListener('keydown', onKey, true)

  const list = () => {
    redraw = list
    const { profiles, demo } = store.state
    body.replaceChildren(
      h('div', { class: 'modal-head' }, h('h2', null, 'Settings'), h('button', { class: 'icon-btn', type: 'button', title: 'Close', onClick: closeSettings }, icon('x', 16))),
      h('div', { class: 'section-label' }, 'Providers'),
      profiles.length || demo
        ? h(
            'div',
            { class: 'profiles' },
            demo ? h('div', { class: 'profile active' }, h('div', { class: 'profile-main' }, h('b', null, 'Demo'), h('small', null, 'scripted fake model, nothing is saved'))) : null,
            profiles.map((p) =>
              h(
                'div',
                { class: `profile ${p.active && !demo ? 'active' : ''}`, role: 'button', tabindex: 0, onClick: () => void croo.useProfile(p.name) },
                h('span', { class: 'radio' }),
                h('div', { class: 'profile-main' }, h('b', null, p.name), h('small', null, `${p.model} · ${p.provider}${p.hasKey ? '' : ' · no key'}`)),
                h('button', { class: 'row-btn show', type: 'button', title: 'Remove provider', onClick: (e: Event) => (e.stopPropagation(), void croo.removeProfile(p.name)) }, icon('trash', 14)),
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'No providers yet.'),
      h('button', { class: 'btn', type: 'button', onClick: add }, icon('plus', 14), 'Add provider'),
      h('div', { class: 'section-label' }, 'About'),
      h('p', { class: 'muted' }, 'Croo runs on your machine. Your keys, chats and folders stay in ~/.config/croo and ~/.local/share/croo. The only network calls are to the model provider you choose.'),
    )
  }
  const add = () => {
    redraw = undefined
    body.replaceChildren(
      h('div', { class: 'modal-head' }, h('h2', null, 'Add provider')),
      providerSetup(() => list(), list),
    )
  }
  redraw = list
  list()
}

let redraw: (() => void) | undefined

/** The provider list follows state changes (switching or removing a provider) while the sheet is open. */
export function refreshSettings() {
  if (modal) redraw?.()
}
