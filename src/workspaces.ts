import fs from 'node:fs'
import path from 'node:path'
import { dataDir } from './config.js'

const file = (dir = dataDir()) => path.join(dir, 'workspaces.json')

/** The folders shown in the sidebar, in the order the user added them. */
export function loadWorkspaces(dir = dataDir()): string[] {
  try {
    const data = JSON.parse(fs.readFileSync(file(dir), 'utf8'))
    return Array.isArray(data) ? data.filter((p) => typeof p === 'string') : []
  } catch {
    return []
  }
}

export function saveWorkspaces(list: string[], dir = dataDir()) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(file(dir), JSON.stringify(list, null, 2) + '\n', { mode: 0o600 })
}
