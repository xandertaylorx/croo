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

Let me look around, then propose a file so you can try the permission prompt.
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
    async chat(req: ChatRequest, onText): Promise<ChatResult> {
      const usage = { input: 120, output: 80 }
      await sleep(900, req.signal) // let the spinner and frog show
      const last = req.messages[req.messages.length - 1]
      if (last?.role === 'user') {
        await stream(INTRO, onText, req.signal)
        return { text: INTRO, usage, toolCalls: [{ id: 'demo1', name: 'list_files', args: {} }] }
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
