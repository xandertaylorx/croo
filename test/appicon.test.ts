import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_ICONS, iconFile, isAppIcon } from '../src/appicon.js'

describe('app icons', () => {
  it('knows the three choices and defaults to green on black', () => {
    expect(APP_ICONS.map((i) => i.id)).toEqual(['green', 'white', 'black'])
    expect(iconFile('white')).toBe('icon-white.png')
    expect(iconFile('black')).toBe('icon-light.png')
    expect(iconFile(undefined)).toBe('icon.png')
    expect(iconFile('purple')).toBe('icon.png')
    expect(isAppIcon('green')).toBe(true)
    expect(isAppIcon('purple')).toBe(false)
  })
  it('has a drawn file for every choice, shipped with the app', () => {
    for (const i of APP_ICONS) expect(fs.existsSync(path.join('build', i.file))).toBe(true)
    expect(JSON.parse(fs.readFileSync('package.json', 'utf8')).build.files).toContain('build/icon*.png')
  })
})
