import type { ChatRequest, ChatResult, Profile, Provider } from '../types.js'

export const DEMO_PROFILE: Profile = { type: 'openai', model: 'demo (no API)' }

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true })
  })

const INTRO = `## Hello from the demo
I am **not** a real model, so no API key is needed. Here is what Croo's output looks like:

- lists with bullets
- inline \`code\` and **bold**

\`\`\`ts
const frog = "ribbit"
console.log(frog)
\`\`\`

\`\`\`bash
npm test && git status
\`\`\`

| Mode | What it does |
| --- | --- |
| **Manual** | Asks before everything |
| **Auto** | Asks only when it matters |
| **Bypass** | Never asks |

- [x] Read the project
- [ ] Try the permission prompt

> Tip: type \`@\` in the message box to mention a file.

Let me look around, then propose a file so you can try the permission prompt.
`

const THOUGHT = `The user wants a quick tour. I'll show markdown, a list and some code, then look around the folder and propose a file so they can try the approval prompt.`

const CHAT = `## Hi, I'm the demo
In **Chat** mode there are no folders or tools, just a conversation. A real model would answer here. This one only shows how replies look:

\`\`\`python
def greet(name: str) -> str:
    return f"ribbit, {name}!"
\`\`\`
`

const OUTRO = `All done. That was the demo: tool cards, a diff prompt, streaming and the spinner.
Run \`croo\` without \`--demo\` to set up a real provider.
`

async function stream(text: string, onText: (d: string) => void, signal?: AbortSignal) {
  for (let i = 0; i < text.length && !signal?.aborted; i += 6) {
    onText(text.slice(i, i + 6))
    await sleep(12, signal)
  }
}

const lastUser = (req: ChatRequest) => req.messages.map((m) => m.role).lastIndexOf('user')

/** Scripted stand-in for a model: streams markdown, calls list_files, then write_file. */
export function demoProvider(): Provider {
  return {
    async chat(req: ChatRequest, onText, onThinking): Promise<ChatResult> {
      const usage = { input: 120, output: 80 }
      const last = req.messages[req.messages.length - 1]
      if (last?.role === 'user') {
        await stream(THOUGHT, (d) => onThinking?.(d), req.signal)
      }
      await sleep(500, req.signal) // let the spinner and frog show
      if (!req.tools.length) {
        await stream(CHAT, onText, req.signal)
        return { text: CHAT, thinking: THOUGHT, usage, toolCalls: [] }
      }
      if (last?.role === 'user') {
        await stream(INTRO, onText, req.signal)
        return { text: INTRO, thinking: THOUGHT, usage, toolCalls: [{ id: 'demo1', name: 'list_files', args: {} }] }
      }
      const wrote = req.messages.some((m, i) => m.role === 'tool' && m.name === 'write_file' && i > lastUser(req))
      if (!wrote) {
        return {
          text: '',
          usage,
          toolCalls: [{ id: 'demo2', name: 'write_file', args: { path: 'croo-demo.txt', content: 'ribbit\nCroo was here.\n' } }],
        }
      }
      await stream(OUTRO, onText, req.signal)
      return { text: OUTRO, usage, toolCalls: [] }
    },
  }
}
