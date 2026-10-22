// Bundles the Electron main process, the preload bridge and the renderer into dist/.
import * as esbuild from 'esbuild'
import fs from 'node:fs'

const watch = process.argv.includes('--watch')

const common = { bundle: true, sourcemap: true, logLevel: 'info' }
const targets = [
  { ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.js', platform: 'node', format: 'esm', target: 'node22', external: ['electron', 'node-pty'] },
  // Sandboxed preload scripts must be CommonJS.
  { ...common, entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.cjs', platform: 'node', format: 'cjs', target: 'node22', external: ['electron'] },
  { ...common, entryPoints: ['src/renderer/app.ts'], outfile: 'dist/renderer/app.js', platform: 'browser', format: 'iife', target: 'chrome140' },
]

function copyStatic() {
  fs.mkdirSync('dist/renderer', { recursive: true })
  fs.copyFileSync('node_modules/@xterm/xterm/css/xterm.css', 'dist/renderer/xterm.css')
  fs.copyFileSync('node_modules/katex/dist/katex.min.css', 'dist/renderer/katex.min.css')
  fs.mkdirSync('dist/renderer/fonts', { recursive: true })
  for (const f of fs.readdirSync('node_modules/katex/dist/fonts')) if (f.endsWith('.woff2')) fs.copyFileSync(`node_modules/katex/dist/fonts/${f}`, `dist/renderer/fonts/${f}`)
  for (const f of ['index.html', 'styles.css']) fs.copyFileSync(`src/renderer/${f}`, `dist/renderer/${f}`)
}

fs.rmSync('dist', { recursive: true, force: true })
copyStatic()

if (watch) {
  for (const t of targets) await (await esbuild.context(t)).watch()
  fs.watch('src/renderer', copyStatic)
  console.log('watching…')
} else {
  await Promise.all(targets.map((t) => esbuild.build(t)))
}
