import fs from 'node:fs'
import path from 'node:path'
import type { Tool } from './index.js'
import { loadSkills } from '../commands.js'

/** Plan mode: the agent researches, then asks for approval here before anything changes. */
export const planTool: Tool = {
  spec: {
    name: 'propose_plan',
    description:
      'Plan mode only. When your research is done, present the implementation plan for the user to approve. Write it in markdown: the approach, the files you will change and how, and how you will verify it. Keep it concise and specific. If the user approves, plan mode ends and you carry the plan out; if not, revise it.',
    parameters: { type: 'object', properties: { plan: { type: 'string', description: 'The plan, in markdown' } }, required: ['plan'] },
  },
  summarize: (a) => String(a.plan ?? '').trim().split('\n')[0].replace(/^#+\s*/, '').slice(0, 80),
  prepare(a) {
    if (typeof a.plan !== 'string' || !a.plan.trim()) throw new Error('plan is required.')
    return { kind: 'plan', plan: a.plan.trim() }
  },
  async run() {
    return 'The user approved the plan. Plan mode is off: you can now edit files and run commands. Carry out the plan now, keeping a task list with todo_write, and verify the result.'
  },
  denied: 'The user did not approve this plan. You are still in plan mode and cannot change anything. Ask what they want changed, or revise the plan and propose it again.',
}

/** Hand a research question to a fresh agent so the search does not fill this conversation's context. */
export const taskTool: Tool = {
  spec: {
    name: 'task',
    description:
      'Start a research subagent with its own fresh context. It can read files, search, and run read-only commands, but cannot change anything, and it returns a written report. Use it for broad questions that need many searches and reads ("where is auth handled and how does it flow?", "find every caller of X and how they use it"), so the details stay out of this conversation. Give it a complete brief: it sees nothing of this chat. Call it several times in one reply to research independent questions in parallel. Do not use it to read one file you already know about.',
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Three to five words for the progress card, e.g. "Find the auth flow"' },
        prompt: { type: 'string', description: 'The full brief: what to find out, where to look, and what the report should contain' },
      },
      required: ['description', 'prompt'],
    },
  },
  summarize: (a) => String(a.description ?? a.prompt ?? '').slice(0, 80),
  async run(a, ctx) {
    if (typeof a.prompt !== 'string' || !a.prompt.trim()) throw new Error('prompt is required.')
    if (!ctx.runSubagent) throw new Error('Subagents are not available here.')
    return ctx.runSubagent(a.prompt)
  },
}

export const skillTool: Tool = {
  spec: {
    name: 'skill',
    description: 'Load a skill listed in the system prompt: returns its instructions and the other files it comes with. Pass file to read one of those files.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'The skill name' }, file: { type: 'string', description: 'Optional: a file inside the skill, e.g. reference.md' } }, required: ['name'] },
  },
  summarize: (a) => `${a.name ?? ''}${a.file ? ` · ${a.file}` : ''}`,
  async run(a, ctx) {
    const skills = loadSkills(ctx.cwd)
    const s = skills.find((x) => x.name === a.name)
    if (!s) return `No skill named "${a.name}". Available: ${skills.map((x) => x.name).join(', ') || 'none'}.`
    if (a.file) {
      const abs = path.resolve(s.dir, String(a.file))
      if (path.relative(s.dir, abs).startsWith('..')) throw new Error('That file is outside the skill.')
      return fs.readFileSync(abs, 'utf8').slice(0, 100_000)
    }
    const files = listFiles(s.dir).filter((f) => !/^skill\.md$/i.test(f))
    return `${s.body}${files.length ? `\n\n---\nFiles in this skill (read one with skill {name: "${s.name}", file}):\n${files.join('\n')}` : ''}`
  },
}

function listFiles(dir: string, rel = '', out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    if (e.name.startsWith('.') || out.length >= 100) continue
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) listFiles(dir, r, out)
    else out.push(r)
  }
  return out
}
