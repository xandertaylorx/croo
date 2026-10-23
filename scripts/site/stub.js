// Stands in for the Electron preload so the real renderer can run in a plain browser and be captured for the website.
// Everything the app shows is the app's own code; only this data is made up. Pick a scene with ?scene=chat|approve|models|cards.
const scene = new URLSearchParams(location.search).get('scene') || 'chat'
const lines = (text) => text.trim().split('\n')

const profiles = [
  { name: 'claude-code', provider: 'Claude subscription', subscription: 'claude-code', model: 'claude-sonnet-5-5', active: true, hasKey: true, keyHint: 'signed in with the CLI', keySource: 'none', local: false, engine: false, efforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { name: 'codex', provider: 'ChatGPT subscription', subscription: 'codex', model: 'gpt-6.1-sol', active: false, hasKey: true, keyHint: 'signed in with the CLI', keySource: 'none', local: false, engine: false, efforts: ['low', 'medium', 'high'] },
  { name: 'openai', provider: 'openai', model: 'gpt-5', active: false, hasKey: true, keyHint: 'sk-…a1b2', keySource: 'saved', local: false, engine: false, efforts: ['low', 'medium', 'high'], price: { input: 1.25, output: 10, source: 'custom' } },
  { name: 'ollama', provider: 'localhost', model: 'qwen3-coder', active: false, hasKey: true, keyHint: '', keySource: 'none', local: true, engine: false, efforts: [], price: { input: 0, output: 0, source: 'local' } },
]

const chatItems = [
  { kind: 'user', text: 'The cache returns stale results when the locale changes. Can you fix it and make sure the tests pass?' },
  { kind: 'assistant', text: "I'll start by finding where the cache key is built and how the tests exercise it.", commentary: true },
  { kind: 'tool', name: 'read_file', summary: 'src/cache.ts', status: 'ok', result: 'export function getKey(url: string) {…}' },
  { kind: 'tool', name: 'read_file', summary: 'src/cache.test.ts', status: 'ok', result: '…' },
  { kind: 'tool', name: 'grep', summary: 'getKey', status: 'ok', result: 'src/api.ts:44' },
  { kind: 'assistant', text: "The key ignores the locale, so two languages share one entry. I'll thread it through `getKey` and update the callers.", commentary: true },
  { kind: 'tool', name: 'edit_file', summary: 'src/cache.ts', status: 'ok', result: 'Edited src/cache.ts' },
  { kind: 'tool', name: 'edit_file', summary: 'src/api.ts', status: 'ok', result: 'Edited src/api.ts' },
  { kind: 'tool', name: 'edit_file', summary: 'src/cache.test.ts', status: 'ok', result: 'Edited src/cache.test.ts' },
  { kind: 'tool', name: 'bash', summary: 'npm test', status: 'ok', result: '✓ 13 passed' },
  {
    kind: 'assistant',
    text: "Fixed. The cache key now includes the locale, so switching language no longer returns another language's entry.\n\n- **`src/cache.ts:18`**: `getKey(url, locale)` builds the key from both\n- **`src/api.ts:44`**: callers pass `ctx.locale`\n\nA new test covers the locale case, and all 13 tests pass.",
    meta: 'claude-sonnet-5-5 · 14.2s · 41k tokens',
  },
  { kind: 'changes', files: ['src/cache.ts', 'src/api.ts', 'src/cache.test.ts'] },
]

const approveItems = [
  { kind: 'user', text: 'Rename the helper to buildKey and update the callers.' },
  { kind: 'assistant', text: "Found two callers. I'll rename it in `cache.ts` first.", commentary: true },
  { kind: 'tool', name: 'grep', summary: 'getKey', status: 'ok', result: 'src/api.ts:44' },
  { kind: 'tool', name: 'read_file', summary: 'src/cache.ts', status: 'ok', result: '…' },
  {
    kind: 'confirm',
    id: 'x',
    name: 'edit_file',
    summary: 'src/cache.ts',
    preview: {
      kind: 'diff',
      path: 'src/cache.ts',
      added: 3,
      removed: 3,
      more: 0,
      lines: [
        { type: ' ', text: 'const entries = new Map<string, Entry>()', oldNo: 16, newNo: 16 },
        { type: ' ', text: '', oldNo: 17, newNo: 17 },
        { type: '-', text: 'export function getKey(url: string) {', oldNo: 18 },
        { type: '-', text: '  return url', oldNo: 19 },
        { type: '-', text: '}', oldNo: 20 },
        { type: '+', text: 'export function buildKey(url: string, locale: string) {', newNo: 18 },
        { type: '+', text: '  return `${locale}:${url}`', newNo: 19 },
        { type: '+', text: '}', newNo: 20 },
        { type: ' ', text: '', oldNo: 21, newNo: 21 },
      ],
    },
  },
]

const weather = {
  type: 'weather',
  place: 'Lisbon, Portugal',
  units: { temp: '°C', wind: 'km/h' },
  now: { temp: 19, feels: 18, humidity: 62, wind: 14, code: 2, day: true },
  hourly: ['15:00', '16:00', '17:00', '18:00', '19:00', '20:00'].map((time, i) => ({ time, temp: [19, 19, 18, 17, 15, 14][i], code: [2, 2, 3, 3, 61, 61][i] })),
  daily: [
    ['2026-10-23', 2, 20, 13, 0],
    ['2026-10-24', 61, 17, 12, 4],
    ['2026-10-25', 3, 18, 12, 0],
    ['2026-10-26', 0, 21, 13, 0],
    ['2026-10-27', 0, 22, 14, 0],
  ].map(([date, code, max, min, rain]) => ({ date, code, max, min, rain })),
}
const cardItems = [
  { kind: 'user', text: "I'm in Lisbon this weekend. What should I wear, and how do the temperatures compare through the week?" },
  { kind: 'tool', name: 'weather', summary: 'Lisbon', status: 'ok', result: 'Lisbon: 19°C, partly cloudy', card: weather },
  {
    kind: 'assistant',
    text: 'Mild and a little breezy today, but **Saturday brings light rain** in the evening, so pack a thin waterproof layer. Otherwise a t-shirt and a light jacket will do.\n\n```chart\n{"type":"line","title":"Daily high and low","unit":"°C","labels":["Fri","Sat","Sun","Mon","Tue"],"series":[{"name":"High","values":[20,17,18,21,22]},{"name":"Low","values":[13,12,12,13,14]}]}\n```\n\nIt warms up from Monday.',
    meta: 'claude-haiku-5-5 · 3.1s',
  },
]

const diffs = {
  'src/cache.ts': lines(`
diff --git a/src/cache.ts b/src/cache.ts
--- a/src/cache.ts
+++ b/src/cache.ts
@@ -15,7 +15,7 @@ const entries = new Map<string, Entry>()
 
-export function getKey(url: string) {
-  return url
+export function getKey(url: string, locale: string) {
+  return \`\${locale}:\${url}\`
 }
 
 export function get(key: string) {`).join('\n'),
  'src/api.ts': lines(`
diff --git a/src/api.ts b/src/api.ts
--- a/src/api.ts
+++ b/src/api.ts
@@ -42,5 +42,5 @@ export async function load(ctx: Ctx, url: string) {
-  const key = getKey(url)
+  const key = getKey(url, ctx.locale)
   const hit = get(key)
   if (hit) return hit`).join('\n'),
}

const code = scene !== 'cards'
const view = { chat: chatItems, approve: approveItems, models: chatItems, cards: cardItems }[scene]
const STATE = {
  platform: 'darwin', version: '0.22.0', home: '/Users/alex', secureKeys: true, ready: true, demo: false, permissionMode: 'auto', effort: 'auto', notify: true, memory: true, diagnostics: true,
  memoryEntries: [], userName: 'Alex', avatar: '', profiles: scene === 'cards' ? profiles.map((p, i) => ({ ...p, active: p.name === 'claude-code', model: p.name === 'claude-code' ? 'claude-haiku-5-5' : p.model })) : profiles,
  localModels: [], engine: false, voice: { engine: false, status: 'none', progress: 0, bytes: 0 }, mcpServers: [],
  workspaces: [{ path: '/Users/alex/code/shop', name: 'shop', missing: false, instructions: ['AGENTS.md'], chats: [
    { id: 'c1', title: scene === 'approve' ? 'Rename getKey to buildKey' : 'Fix the cache key', updatedAt: '2026-10-23T10:00:00Z', running: false },
    { id: 'c2', title: 'Add a dark mode toggle', updatedAt: '2026-10-22T10:00:00Z', running: false },
    { id: 'c3', title: 'Why is CI red on main?', updatedAt: '2026-10-21T10:00:00Z', running: false },
  ] }],
  chats: [{ id: 'c1', title: 'Weekend in Lisbon', updatedAt: '2026-10-23T10:00:00Z', running: false }, { id: 'c2', title: 'Explain big-O to a ten year old', updatedAt: '2026-10-22T10:00:00Z', running: false }],
}

localStorage.clear()
localStorage.setItem('croo.mode', code ? 'code' : 'chat')
localStorage.setItem('croo.lastChat.' + (code ? 'code' : 'chat'), 'c1')

window.croo = new Proxy({}, {
  get: (_, k) => {
    if (k === 'getState') return async () => STATE
    if (k === 'openChat') return async () => ({ cwd: code ? '/Users/alex/code/shop' : '', kind: code ? 'code' : 'chat', title: 'Fix the cache key', items: view, checkpoints: [0], context: { used: 52000, window: 200000 } })
    if (k === 'gitStatus') return async () => ({ repo: true, branch: 'fix/cache-locale', upstream: undefined, ahead: 0, behind: 0, remotes: ['origin'], gh: true, files: [
      { path: 'src/cache.ts', index: ' ', work: 'M', add: 2, del: 2 }, { path: 'src/api.ts', index: ' ', work: 'M', add: 1, del: 1 }, { path: 'src/cache.test.ts', index: ' ', work: 'M', add: 18, del: 0 } ] })
    if (k === 'gitDiff') return async (_cwd, path) => diffs[path] ?? ''
    if (k === 'suggestCommit') return async () => ({ ok: true, message: 'Include the locale in the cache key' })
    if (k === 'listModels') return async () => ({ models: [] })
    if (k === 'subscriptionStatus') return async () => []
    if (k === 'fsList') return async () => ({ entries: [] })
    if (String(k).startsWith('on')) return () => {}
    return async () => ({ ok: true, entries: [], files: [], items: [], commands: [], models: [] })
  },
})
