export const COMMIT_SYSTEM = [
  'You write git commit messages.',
  'Output only the message: a subject line of at most 72 characters in the imperative mood ("Add", "Fix", "Rename"), no trailing period.',
  'If the change needs it, add a blank line and up to four short "- " bullets saying what changed and why.',
  'Describe what the diff does, not what you assume. No quotes, no code fences, no preamble.',
].join(' ')

const MAX_DIFF = 14_000

export function commitPrompt(files: string[], diff: string): string {
  const body = diff.length > MAX_DIFF ? `${diff.slice(0, MAX_DIFF)}\n… (diff truncated)` : diff
  return `Files changed:\n${files.map((f) => `- ${f}`).join('\n')}\n\nDiff:\n${body}\n\nWrite the commit message.`
}

/** Models like to wrap the answer in fences, quotes or a "Commit message:" label; keep only the message. */
export function cleanCommitMessage(raw: string): string {
  let t = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  t = t.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim()
  t = t.replace(/^(commit message|message)\s*:\s*/i, '').trim()
  if (/^(["'`]).*\1$/s.test(t) && !t.includes('\n')) t = t.slice(1, -1).trim()
  const lines = t.split('\n')
  lines[0] = lines[0].replace(/\.$/, '').slice(0, 100)
  return lines.join('\n').trim()
}
