import fs from 'node:fs'
import path from 'node:path'

const INSTRUCTION_FILES = ['CROO.md', 'AGENTS.md']
const MAX_INSTRUCTIONS = 20000

export function loadProjectInstructions(cwd: string): string | null {
  for (const name of INSTRUCTION_FILES) {
    try {
      const text = fs.readFileSync(path.join(cwd, name), 'utf8').trim()
      if (text) return `# Project instructions (${name})\n${text.slice(0, MAX_INSTRUCTIONS)}`
    } catch {}
  }
  return null
}

export function buildSystemPrompt(cwd: string, now = new Date()): string {
  const parts = [
    `You are Croo, a small, friendly, open-source coding agent running in a desktop app. You are working in the folder: ${cwd}`,
    `Platform: ${process.platform}. Date: ${now.toISOString().slice(0, 10)}.`,
    [
      'Guidelines:',
      '- Use the tools to inspect and change the project. Read files before editing them.',
      '- Prefer edit_file for small changes and write_file for new files. Keep diffs minimal.',
      '- File tools only work inside the working directory. Paths are relative to it.',
      '- Use bash for builds, tests and git. Avoid destructive commands unless the user asked.',
      '- Be concise. Explain what you did in a sentence or two; do not paste whole files back.',
      '- If a tool call is denied by the user, do not retry it; ask how they would like to proceed.',
    ].join('\n'),
  ]
  const project = loadProjectInstructions(cwd)
  if (project) parts.push(project)
  return parts.join('\n\n')
}
