import fs from 'node:fs'
import os from 'node:os'
import { createRequire } from 'node:module'

// node-pty is a native module, so it is loaded at runtime rather than bundled.
const pty = createRequire(import.meta.url)('node-pty') as typeof import('node-pty')

/** Real shells for the terminal panel, one pty per tab. */
export class Terminals {
  private ptys = new Map<string, import('node-pty').IPty>()
  private n = 0

  create(cwd: string, cols: number, rows: number, onData: (id: string, data: string) => void, onExit: (id: string) => void): string {
    const win = process.platform === 'win32'
    const shell = win ? 'powershell.exe' : process.env.SHELL || '/bin/zsh'
    const dir = fs.existsSync(cwd) ? cwd : os.homedir()
    const id = `t${++this.n}`
    const term = pty.spawn(shell, win ? [] : ['-l'], {
      name: 'xterm-256color',
      cols: Math.max(cols, 2),
      rows: Math.max(rows, 1),
      cwd: dir,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Croo' } as Record<string, string>,
    })
    term.onData((d) => onData(id, d))
    term.onExit(() => {
      this.ptys.delete(id)
      onExit(id)
    })
    this.ptys.set(id, term)
    return id
  }

  write(id: string, data: string) {
    this.ptys.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    try {
      this.ptys.get(id)?.resize(Math.max(cols, 2), Math.max(rows, 1))
    } catch {} // the pty may have just exited
  }

  kill(id: string) {
    const t = this.ptys.get(id)
    this.ptys.delete(id)
    try {
      t?.kill()
    } catch {}
  }

  killAll() {
    for (const id of [...this.ptys.keys()]) this.kill(id)
  }
}
