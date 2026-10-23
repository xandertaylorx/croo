// Captures the real app UI as static HTML for the website: web/mock/*.html, styled by the app's own stylesheet.
// Needs Chrome. Run after changing the app's UI:  node scripts/make-site-mocks.mjs
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const run = promisify(execFile)
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p))
if (!CHROME) throw new Error('Chrome not found.')
const SCENES = { chat: [1360, 900], approve: [1000, 680], models: [920, 740], cards: [1000, 1210] }

execFileSync('node', ['scripts/build.mjs'], { stdio: 'inherit' })
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'croo-site-'))
fs.cpSync('dist/renderer', root, { recursive: true })
fs.copyFileSync('scripts/site/stub.js', path.join(root, 'stub.js'))
fs.copyFileSync('scripts/site/scenes.js', path.join(root, 'scenes.js'))
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('<script src="app.js"></script>', '<script src="stub.js"></script><script src="app.js"></script><script type="module" src="scenes.js"></script>')
fs.writeFileSync(path.join(root, 'index.html'), index)

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }
const server = http.createServer((req, res) => {
  const file = path.join(root, new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html'))
  fs.readFile(file, (err, data) => (err ? (res.writeHead(404), res.end()) : (res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }), res.end(data))))
})
await new Promise((r) => server.listen(0, r))
const port = server.address().port

const out = 'web/mock'
fs.mkdirSync(out, { recursive: true })
fs.copyFileSync('dist/renderer/styles.css', `${out}/app-ui.css`)
fs.mkdirSync(`${out}/fonts`, { recursive: true })
for (const f of fs.readdirSync('dist/renderer/fonts')) if (/plus-jakarta/.test(f)) fs.copyFileSync(`dist/renderer/fonts/${f}`, `${out}/fonts/${f}`)

for (const [scene, [w, h]] of Object.entries(SCENES)) {
  // Not spawnSync: the page is served by this process.
  const r = await run(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, '--virtual-time-budget=6000', '--dump-dom', `http://localhost:${port}/index.html?scene=${scene}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000 }).catch((e) => ({ stdout: e.stdout ?? '', stderr: String(e.stderr ?? e.message) }))
  let html = r.stdout
  if (!html.includes('data-captured="yes"')) throw new Error(`Scene ${scene} did not finish. ${r.stderr.slice(-300)}`)
  html = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .replace(/<link rel="stylesheet" href="(xterm|katex.min).css">/g, '')
    .replace(/<link rel="stylesheet" href="styles.css">/, '<link rel="stylesheet" href="app-ui.css">')
    .replace('<html ', `<html data-scene="${scene}" data-w="${w}" data-h="${h}" `)
    .replace('</head>', '<style>html,body{pointer-events:none;user-select:none;overflow:hidden}</style></head>')
  fs.writeFileSync(`${out}/${scene}.html`, html)
  console.log(`${scene}: ${Math.round(html.length / 1024)} KB`)
}
server.close()
