import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { RunExit, RunKind } from '../shared/ipc.js'

/** Runs snippets from the chat (shell, Python, Node) in a folder and streams their output. */
export class Runner {
  private procs = new Map<string, { child: ChildProcess; file?: string }>()
  private n = 0

  start(cwd: string, kind: RunKind, code: string, onData: (id: string, data: string) => void, onExit: (e: RunExit) => void): string {
    const id = `r${++this.n}`
    const win = process.platform === 'win32'
    const shell = win ? 'powershell.exe' : process.env.SHELL || '/bin/zsh'
    let file: string | undefined
    let argv: string[]
    if (kind === 'shell') argv = win ? ['-NoProfile', '-Command', code] : ['-lc', code]
    else {
      // Scripts go through a temp file so multi-line code, imports and stdin behave like a normal run.
      const ext = kind === 'python' ? '.py' : /^\s*(import|export)\s/m.test(code) ? '.mjs' : '.js'
      file = path.join(os.tmpdir(), `croo-run-${process.pid}-${id}${ext}`)
      fs.writeFileSync(file, code, { mode: 0o600 })
      const runner = kind === 'python' ? 'python3 -u' : 'node'
      argv = win ? ['-NoProfile', '-Command', `${kind === 'python' ? 'python' : 'node'} "${file}"`] : ['-lc', `exec ${runner} "$0"`, file]
    }
    const child = spawn(shell, argv, {
      cwd,
      detached: !win,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', PYTHONUNBUFFERED: '1', TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.procs.set(id, { child, file })
    child.stdout?.on('data', (d: Buffer) => onData(id, d.toString()))
    child.stderr?.on('data', (d: Buffer) => onData(id, d.toString()))
    child.on('error', (e) => onData(id, `Could not start: ${e.message}\n`))
    child.on('close', (codeNum, signal) => {
      if (file) fs.rm(file, { force: true }, () => {})
      this.procs.delete(id)
      onExit({ id, code: codeNum, signal })
    })
    return id
  }

  stop(id: string) {
    const p = this.procs.get(id)
    if (!p?.child.pid) return
    try {
      if (process.platform === 'win32') p.child.kill()
      else process.kill(-p.child.pid, 'SIGTERM')
    } catch {}
    // Give it a moment to exit cleanly, then make sure.
    setTimeout(() => {
      try {
        if (this.procs.has(id)) process.platform === 'win32' ? p.child.kill('SIGKILL') : process.kill(-p.child.pid!, 'SIGKILL')
      } catch {}
    }, 1500)
  }

  stopAll() {
    for (const id of [...this.procs.keys()]) this.stop(id)
  }
}
