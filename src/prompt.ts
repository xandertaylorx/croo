import fs from 'node:fs'
import path from 'node:path'

/** Instruction files Croo reads from the folder, in the order they are shown to the model. */
export const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', 'CROO.md']
const MAX_INSTRUCTIONS = 20000

/** Which of the instruction files exist in this folder (and are not empty). */
export function instructionFiles(cwd: string): string[] {
  return INSTRUCTION_FILES.filter((name) => {
    try {
      return fs.statSync(path.join(cwd, name)).size > 0
    } catch {
      return false
    }
  })
}

/** Every instruction file that exists is included, so a repo can ship both AGENTS.md and CLAUDE.md. */
export function loadProjectInstructions(cwd: string): string | null {
  const parts: string[] = []
  let budget = MAX_INSTRUCTIONS
  for (const name of instructionFiles(cwd)) {
    const text = fs.readFileSync(path.join(cwd, name), 'utf8').trim().slice(0, budget)
    budget -= text.length
    parts.push(`# Project instructions (${name})\n${text}`)
    if (budget <= 0) break
  }
  return parts.length ? parts.join('\n\n') : null
}

/** What `/init` sends to the model. The chat shows just "/init". */
export const INIT_PROMPT = `Please study this project and write an AGENTS.md file in the folder root that will help future coding agents work in it. If AGENTS.md or CLAUDE.md already exists, improve that file in place instead of creating a new one.

Research first: read the README, package/manifest files, build and CI config, and the main source directories. Look for existing rules too (CLAUDE.md, .cursorrules, .github/copilot-instructions.md) and fold in what matters.

The file should contain:
1. The commands to install, build, lint and test, including how to run a single test.
2. The big-picture architecture: the parts that only become clear after reading several files, how data flows, and where things live.
3. Conventions and gotchas that are specific to this project (naming, style, things that are easy to break).

Keep it short and specific. Do not list every file, do not repeat generic advice like "write tests", and do not invent facts: only include what you verified in the code. Begin the file with a one-line description of the project. When you are done, tell me in one or two sentences what you wrote.`

export function buildChatPrompt(now = new Date()): string {
  return [
    `You are Croo, a small, friendly assistant living in a desktop app. Date: ${now.toISOString().slice(0, 10)}.`,
    'This is a plain conversation: you have no access to files or the shell here. Answer clearly and concisely. Use markdown, and put code in fenced blocks with a language tag.',
  ].join('\n')
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
