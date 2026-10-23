import { spawn, type ChildProcess } from 'node:child_process'
import type { Tool } from './index.js'

/**
 * Commands the agent started with run_in_background: dev servers, watchers, long builds. They keep running
 * across steps and turns; the agent reads what they printed with bash_output and stops them with bash_kill.
 */
interface Job {
  id: string
  command: string
  cwd: string
  child: ChildProcess
  out: string
  /** How much of `out` the agent has already been shown. */
  read: number
  exit?: number | null
  started: number
}

const MAX_KEPT = 200_000
const jobs = new Map<string, Job>()
let next = 1

function kill(child: ChildProcess) {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM')
    else child.kill('SIGTERM')
  } catch {}
}

export function startBackground(command: string, cwd: string): Job {
  const id = `bg${next++}`
  const child = spawn(command, { shell: true, cwd, detached: process.platform !== 'win32', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
  const job: Job = { id, command, cwd, child, out: '', read: 0, started: Date.now() }
  const add = (d: Buffer) => {
    job.out += d.toString()
    // Keep the tail; move the read mark along with what was dropped.
    if (job.out.length > MAX_KEPT) {
      const drop = job.out.length - MAX_KEPT
      job.out = job.out.slice(drop)
      job.read = Math.max(0, job.read - drop)
    }
  }
  child.stdout?.on('data', add)
  child.stderr?.on('data', add)
  child.on('error', (e) => ((job.out += `\nFailed to start: ${e.message}`), (job.exit = -1)))
  child.on('close', (code) => (job.exit = code))
  jobs.set(id, job)
  return job
}

const state = (j: Job) => (j.exit === undefined ? 'running' : `exited with code ${j.exit}`)

/** Wait a moment so a freshly started server has printed its first lines (or failed). */
export async function firstOutput(job: Job, ms = 1500): Promise<string> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms && job.exit === undefined && !/\n.*\n/.test(job.out)) await new Promise((r) => setTimeout(r, 100))
  const shown = job.out.slice(job.read)
  job.read = job.out.length
  return `Started in the background as ${job.id} (${state(job)}). Read its output with bash_output and stop it with bash_kill.${shown.trim() ? `\n\nOutput so far:\n${shown.trimEnd()}` : ''}`
}

export function killAllBackground() {
  for (const j of jobs.values()) if (j.exit === undefined) kill(j.child)
  jobs.clear()
}

export const bashOutput: Tool = {
  spec: {
    name: 'bash_output',
    description: 'Read new output from a command started with bash run_in_background (only what was printed since the last read), and whether it is still running. Pass filter to keep only lines matching a regex.',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'The id bash returned, e.g. bg1' }, filter: { type: 'string', description: 'Optional regex; only matching lines are returned' } }, required: ['id'] },
  },
  summarize: (a) => String(a.id ?? ''),
  async run(a) {
    const j = jobs.get(String(a.id))
    if (!j) return `No background command "${a.id}". Running: ${[...jobs.values()].filter((x) => x.exit === undefined).map((x) => `${x.id} (${x.command})`).join(', ') || 'none'}.`
    let text = j.out.slice(j.read)
    j.read = j.out.length
    if (a.filter) {
      const re = new RegExp(String(a.filter))
      text = text.split('\n').filter((l) => re.test(l)).join('\n')
    }
    return `${j.id}: ${j.command}\nStatus: ${state(j)}\n${text.trim() ? text.trimEnd() : '(no new output)'}`
  },
}

export const bashKill: Tool = {
  spec: {
    name: 'bash_kill',
    description: 'Stop a command started with bash run_in_background.',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'The id bash returned, e.g. bg1' } }, required: ['id'] },
  },
  summarize: (a) => String(a.id ?? ''),
  async run(a) {
    const j = jobs.get(String(a.id))
    if (!j) return `No background command "${a.id}".`
    if (j.exit === undefined) kill(j.child)
    jobs.delete(j.id)
    return `Stopped ${j.id} (${j.command}).`
  },
}
