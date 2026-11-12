// Renders the social sharing card: scripts/site/og.html -> web/assets/og.jpg (1200x630).
// The card uses the website's own stylesheet and shader. Needs Chrome and macOS `sips`.
// Run after changing the site's look:  node scripts/make-og.mjs
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const run = promisify(execFile)
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p))
if (!CHROME) throw new Error('Chrome not found.')
const [W, H] = [1200, 630]
const OUT = process.argv[2] ?? 'web/assets/og.jpg'

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x').pathname
  const file = url === '/og.html' ? 'scripts/site/og.html' : path.join('web', url)
  fs.readFile(file, (err, data) => (err ? (res.writeHead(404), res.end()) : (res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }), res.end(data))))
})
await new Promise((r) => server.listen(0, r))

// Drawn at 2x and scaled down, so type and the pixel frog come out clean.
const png = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'croo-og-')), 'og.png')
try {
  await run(CHROME, ['--headless=new', '--hide-scrollbars', '--force-device-scale-factor=2', `--window-size=${W},${H}`, '--virtual-time-budget=5000', `--screenshot=${png}`, `http://localhost:${server.address().port}/og.html`], { timeout: 60000 })
  await run('sips', ['-z', String(H), String(W), '-s', 'format', 'jpeg', '-s', 'formatOptions', '90', png, '--out', OUT])
  console.log(`wrote ${OUT} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`)
} finally {
  server.close()
}
