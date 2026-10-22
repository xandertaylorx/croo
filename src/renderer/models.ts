import type { ModelInfo } from '../shared/ipc.js'
import { h, icon } from './dom.js'
import { bus, croo, store } from './store.js'

/**
 * A searchable list of the models the active key can use. Used by the composer's model menu and by
 * Settings. Typing a name that is not in the list offers to use it as-is (handy for new or local models).
 */
export function modelList(opts: { profile: string; current: string; onPick: (id: string) => void; autofocus?: boolean }) {
  const el = h('div', { class: 'models' })
  const filter = h('input', { class: 'input models-filter', placeholder: 'Search models…', spellcheck: 'false', autocapitalize: 'off' })
  const list = h('div', { class: 'models-list', role: 'listbox' })
  let all: ModelInfo[] = []
  let error: string | undefined
  let loading = true
  let hi = 0

  const shown = () => {
    const q = filter.value.trim().toLowerCase()
    return q ? all.filter((m) => m.id.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q)) : all
  }

  const paint = () => {
    const q = filter.value.trim()
    const rows = shown()
    hi = Math.min(hi, Math.max(rows.length - 1, 0))
    const custom = q && !all.some((m) => m.id === q)
    list.replaceChildren(
      ...(loading ? [h('div', { class: 'models-note' }, h('span', { class: 'spinner' }), 'Loading models…')] : []),
      ...(!loading && error ? [h('div', { class: 'models-note err' }, error)] : []),
      ...rows.map((m, i) =>
        h(
          'button',
          { class: `model-row ${m.id === opts.current ? 'on' : ''} ${i === hi ? 'hi' : ''}`, type: 'button', role: 'option', onClick: () => opts.onPick(m.id) },
          h('span', { class: 'model-id' }, m.id),
          m.name && m.name !== m.id ? h('small', null, m.name) : null,
          m.id === opts.current ? icon('check', 14) : null,
        ),
      ),
      ...(custom ? [h('button', { class: 'model-row custom', type: 'button', onClick: () => opts.onPick(q) }, h('span', { class: 'model-id' }, `Use “${q}”`))] : []),
      ...(!loading && !error && !rows.length && !custom ? [h('div', { class: 'models-note' }, 'No models found.')] : []),
    )
    list.querySelector('.hi')?.scrollIntoView({ block: 'nearest' })
  }

  filter.addEventListener('input', () => ((hi = 0), paint()))
  filter.addEventListener('keydown', (e) => {
    const n = shown().length
    if (e.key === 'ArrowDown') (e.preventDefault(), (hi = Math.min(hi + 1, n - 1)), paint())
    else if (e.key === 'ArrowUp') (e.preventDefault(), (hi = Math.max(hi - 1, 0)), paint())
    else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = shown()[hi]?.id ?? filter.value.trim()
      if (pick) opts.onPick(pick)
    }
  })

  el.append(filter, list)
  paint()
  void croo.listModels(opts.profile).then((r) => {
    loading = false
    all = r.models
    error = r.error
    if (!all.some((m) => m.id === opts.current) && opts.current && !error) all = [{ id: opts.current }, ...all]
    paint()
  })
  if (opts.autofocus) requestAnimationFrame(() => filter.focus())
  return el
}

/** The popover above the composer's model chip. */
export function openModelMenu(anchor: HTMLElement, host: HTMLElement) {
  const existing = host.querySelector('.model-menu')
  if (existing) return existing.remove()
  const active = store.state.profiles.find((p) => p.active)
  const close = () => {
    menu.remove()
    document.removeEventListener('mousedown', outside, true)
    document.removeEventListener('keydown', esc, true)
  }
  const outside = (e: MouseEvent) => !menu.contains(e.target as Node) && !anchor.contains(e.target as Node) && close()
  const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), close())

  const menu = h(
    'div',
    { class: 'model-menu', role: 'dialog', 'aria-label': 'Switch model' },
    store.state.demo || !active
      ? h('div', { class: 'models-note' }, store.state.demo ? 'The demo uses a scripted model. Add a provider to pick real ones.' : 'Add a provider first.')
      : modelList({ profile: active.name, current: active.model, autofocus: true, onPick: (id) => (void croo.setModel(active.name, id), close()) }),
    h(
      'div',
      { class: 'model-foot' },
      h('span', null, active ? `${active.name} · ${active.provider}` : ''),
      h('button', { class: 'link-btn', type: 'button', onClick: () => (close(), bus.settings()) }, 'Providers & keys'),
    ),
  )
  host.append(menu)
  document.addEventListener('mousedown', outside, true)
  document.addEventListener('keydown', esc, true)
}
