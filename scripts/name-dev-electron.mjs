// In development the menu bar and Dock show the name of the Electron binary. Rename it to Croo.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const plist = 'node_modules/electron/dist/Electron.app/Contents/Info.plist'
if (process.platform === 'darwin' && fs.existsSync(plist)) {
  for (const key of ['CFBundleName', 'CFBundleDisplayName']) {
    try {
      execFileSync('plutil', ['-replace', key, '-string', 'Croo', plist])
    } catch {}
  }
}
