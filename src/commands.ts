import fs from 'node:fs'
import path from 'node:path'
import { configPath } from './config.js'

/**
 * Custom slash commands and skills, written as markdown.
 *
 * A command is `<name>.md` in `.croo/commands/` (or `.claude/commands/`) in the folder, or in
 * `~/.config/croo/commands/` for every folder. Typing `/name some text` sends the file's body, with
 * `$ARGUMENTS` replaced by "some text" (or the text added at the end when the body has no placeholder).
 *
 * A skill is a folder with a `SKILL.md` in `.croo/skills/` (or `.claude/skills/`, or `~/.config/croo/skills/`).
 * Its name and description are listed in the system prompt; the agent loads the instructions with the `skill`
 * tool when a task calls for it, so long skills cost nothing until they are used.
 */

export interface Command {
  name: string
  description: string
  argumentHint?: string
  body: string
  source: 'project' | 'global'
}

export interface Skill {
  name: string
  description: string
  dir: string
  body: string
  source: 'project' | 'global'
}

const globalDir = () => path.dirname(configPath())
const PROJECT_DIRS = ['.croo', '.claude']
const NAME = /^[a-z0-9][\w-]*$/i
/** Built into Croo; a file cannot replace them. */
export const BUILTIN_COMMANDS = ['init']

/** Split "---\nkey: value\n---\nbody" into fields and body. Only flat `key: value` lines are read. */
export function frontmatter(text: string): { fields: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!m) return { fields: {}, body: text.trim() }
  const fields: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line)
    if (kv) fields[kv[1].toLowerCase()] = kv[2].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return { fields, body: text.slice(m[0].length).trim() }
}

function readDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir).sort()
  } catch {
    return []
  }
}

/** Where commands or skills live for this folder, project ones first so they win over global ones. */
function roots(cwd: string, kind: 'commands' | 'skills'): [string, 'project' | 'global'][] {
  const out: [string, 'project' | 'global'][] = cwd ? PROJECT_DIRS.map((d) => [path.join(cwd, d, kind), 'project'] as [string, 'project']) : []
  out.push([path.join(globalDir(), kind), 'global'])
  return out
}

export function loadCommands(cwd: string): Command[] {
  const byName = new Map<string, Command>()
  for (const [dir, source] of roots(cwd, 'commands')) {
    for (const f of readDir(dir)) {
      const name = f.replace(/\.md$/i, '')
      if (!f.toLowerCase().endsWith('.md') || !NAME.test(name) || byName.has(name) || BUILTIN_COMMANDS.includes(name)) continue
      try {
        const { fields, body } = frontmatter(fs.readFileSync(path.join(dir, f), 'utf8'))
        if (!body) continue
        byName.set(name, { name, description: fields.description || body.split('\n')[0].replace(/^#+\s*/, '').slice(0, 80), argumentHint: fields['argument-hint'], body, source })
      } catch {}
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** "/review src/a.ts" → the review command's text for the model, or null when it is not a custom command. */
export function expandCommand(text: string, cwd: string): string | null {
  const m = /^\/([\w-]+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (!m) return null
  const cmd = loadCommands(cwd).find((c) => c.name === m[1])
  if (!cmd) return null
  const args = (m[2] ?? '').trim()
  const words = args.split(/\s+/).filter(Boolean)
  if (/\$ARGUMENTS|\$\d/.test(cmd.body)) return cmd.body.replace(/\$ARGUMENTS/g, args).replace(/\$(\d)/g, (_, n) => words[Number(n) - 1] ?? '')
  return args ? `${cmd.body}\n\n${args}` : cmd.body
}

export function loadSkills(cwd: string): Skill[] {
  const byName = new Map<string, Skill>()
  for (const [dir, source] of roots(cwd, 'skills')) {
    for (const d of readDir(dir)) {
      const skillDir = path.join(dir, d)
      const file = ['SKILL.md', 'skill.md'].map((f) => path.join(skillDir, f)).find((f) => fs.existsSync(f))
      if (!file) continue
      try {
        const { fields, body } = frontmatter(fs.readFileSync(file, 'utf8'))
        const name = fields.name || d
        if (!NAME.test(name) || byName.has(name) || !body) continue
        byName.set(name, { name, description: (fields.description || body.split('\n')[0]).slice(0, 400), dir: skillDir, body, source })
      } catch {}
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** The system prompt section that tells the model which skills exist. */
export function skillsBlock(skills: Skill[]): string {
  if (!skills.length) return ''
  return `# Skills
Skills are instructions for particular kinds of tasks, written by the user or the project. When a task matches a skill's description, call the skill tool with its name first and follow what it says.
${skills.map((s) => `- ${s.name}: ${s.description}`).join('\n')}`
}
