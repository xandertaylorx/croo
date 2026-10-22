import { execFile } from 'node:child_process'

const COMMON = ['/opt/homebrew/bin', '/opt/homebrew/sbin', '/usr/local/bin', '/usr/local/sbin']

const merge = (...lists: string[][]) => [...new Set(lists.flat().filter(Boolean))].join(':')

/**
 * An app opened from Finder does not get the PATH from your shell setup, so tools like gh, node and brew
 * installs are not found. Add the usual Homebrew folders at once, then ask your login shell for the real PATH.
 */
export function fixPath() {
  if (process.platform !== 'darwin') return
  const current = (process.env.PATH ?? '').split(':')
  process.env.PATH = merge(current, COMMON)
  execFile(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf "__CROO_PATH__%s" "$PATH"'], { timeout: 4000 }, (err, stdout) => {
    const fromShell = err ? '' : stdout.split('__CROO_PATH__').pop() ?? ''
    if (fromShell) process.env.PATH = merge(fromShell.split(':'), current, COMMON)
  })
}
