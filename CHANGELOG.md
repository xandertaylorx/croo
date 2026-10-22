# Changelog

## 0.14.1

- **Newer OpenAI models work**: Croo now talks to OpenAI through the Responses API, so models like gpt-6.x take tools and a reasoning effort together instead of failing with "Function tools with reasoning_effort are not supported" or "not supported in the v1/chat/completions endpoint". Reasoning summaries show in the Thinking row. Other OpenAI-compatible servers (Groq, OpenRouter, Ollama, LM Studio) are unchanged

## 0.14.0

- **Quieter, more minimal look**: warm neutral greys in place of the green tint, with green kept for the frog and for success. Buttons, the send button and selected options use plain ink instead of green, corners are tighter, the message box is flat with a hairline border, and the soft glows are gone
- Section labels are in sentence case instead of all caps, headings and labels use lighter weights, and user messages sit in a plain rounded block
- Links, inline code, quotes and @mentions are neutral instead of green; menus and dialogs have tighter corners and no blurred backdrop

## 0.13.0

- **Queue messages**: while the agent is working, type your next message and press ↵ or ⌘↵ to line it up; it sends when the current task finishes. Queued messages show above the box (✕ to remove); Stop returns when the box is empty, and stopping clears the queue
- **Faster voice**: transcription runs through a warm Whisper server that starts as soon as you begin speaking, so text appears in a fraction of a second instead of waiting for the model to load. The first use after installing still takes a few seconds while macOS prepares the GPU
- **Code blocks keep their Copy / Run header in view** while you scroll a long block

## 0.12.2

- Small models that write a tool call out as text (`{"name":"bash",...}`, a fenced block or a `<tool_call>` tag) instead of using the tool channel now work: Croo recognises the call for the tools it offered and runs it through the usual approval step. The agent is also told to act with tools rather than print commands for you to run

## 0.12.1

- **Math renders**: LaTeX in replies (`$x^2$`, `$$…$$`, `\(…\)`, `\[…\]`) is typeset with KaTeX instead of showing raw `$$` and backslashes; prices like `$5 and $10` are left alone
- The agent no longer refuses a plain "delete these files" request; risky commands still ask for your approval first

## 0.12.0

- **Voice input**: a mic button in the message box. While you speak a live waveform scrolls by; press ✓ (or Return) and your words are typed in. Speech is turned into text on your Mac with Whisper (built in, 57 MB voice model downloaded the first time, nothing uploaded). Esc cancels
- **AI commit messages**: a ✦ button in the Git panel's message box writes the message from the selected files' diffs using the model you have selected
- **Export chat**: a button in the chat header saves the conversation as markdown
- First run now leads with "Start free, on this Mac" (the built-in local model), with your own key as the alternative

## 0.11.1

- Fixed the "Thinking…" row glitching when you hover or click it while the model is reasoning
- Fixed the Git panel not offering to create a GitHub repository: apps opened from Finder didn't see `gh` (or node, brew tools) on the PATH; Croo now picks up your shell's PATH and the Homebrew folders

## 0.11.0

- **Local model, built in**: Croo now bundles its own engine (llama.cpp). In Settings → Providers (or on first run) download Qwen3 4B Instruct, about 2.5 GB, and it runs on your Mac with Metal: free, private, offline, no account or key. The model lives in Croo's data folder, not in the app, so updating Croo never removes it; downloads resume and are checksum-verified. The engine starts when you chat and stops after ten idle minutes
- Memory has its own tab in Settings
- Fixed choosing a profile picture doing nothing
- Bottom left now shows your profile picture (or your initial) instead of the frog

## 0.10.0

- **Memory**: in Chat mode Croo saves durable things you tell it (preferences, projects, people) and uses them in later chats; a small "Remembered …" line appears in the chat when it does. Notes live in `memory.md` in Croo's data folder as dated markdown. Code mode reads the notes too
- Manage it in Settings → General → Memory: turn it off, forget single notes, or forget everything
- Croo now knows your name from Settings → Profile

## 0.9.1

- **In-app updates**: "Update and restart" (bottom left or Settings → About) downloads the new version, replaces Croo and relaunches it, no manual download. Falls back to the download page if Croo can't write to its own folder
- One-line installer: `curl -fsSL https://ai.crooli.com/install.sh | bash`

## 0.9.0

- **Profile**: set your name and a picture in Settings → General; they show bottom left in place of "Croo" (falls back to the frog and "User")
- Development builds now show "Croo" in the macOS menu bar instead of "Electron"

## 0.8.0

- **Website** in `web/`, a static site: live latest-release download button, install commands, screenshots and features
- The model is now told which model it is, so small local models stop claiming to be GPT-4
- Sent attachments are cards above your message (image thumbnails you can open, file cards with type and size); `@file` mentions show as chips
- Replies read better: formatting guidance for the model, task lists and auto-linked URLs, cleaner headings, tables and quotes, and a copy button on every reply

## 0.7.0

- **Attachments**: paste or drop images and files into the message box, or use the paperclip; images are scaled down before sending and work with Claude, OpenAI-compatible and Gemini models
- **`@file` mentions** with autocomplete: the file is sent along with the message
- **Edit and retry**: edit any message and resend, or retry the last reply
- **`⌘K` search** across chats (titles and contents), files and actions; a search button in the sidebar
- **Cost estimate** beside time and tokens; built-in Claude prices, your own prices per provider in Settings, local models free
- **Notifications** when a task finishes or needs your OK while the window is in the background (Settings → General)
- **Update notice** at the bottom left when a newer GitHub release exists; a release workflow builds and publishes the macOS app when you push a `v*` tag

## 0.6.0

- **Time and tokens**: a live clock and token count while the agent works, with the final tally and an input/output breakdown on hover
- **Publish from the Git panel**: no remote yet? connect by URL or `owner/repo`, or create the repository on GitHub with `gh`; push and pull failures now explain themselves
- **Effort levels** with a composer control, shown only for models that have one; reasoning settings are chosen per model (adaptive thinking on Claude 4.6+, token budgets on older models) and negotiated with the API instead of failing
- **Settings redesign**: Providers, General and About panes; permission and effort defaults, shortcut list
- **Wrapping**: the file viewer and every diff wrap long lines instead of scrolling sideways; the sidebar steps aside in narrow windows
- Chat / Code icons clear the macOS window buttons

## 0.5.0

- **Git panel** (`⌘⇧G`): branch and sync state, changed files with line counts and inline diffs, pick files, commit (`⌘↵`), push (publishes a new branch), pull (fast-forward only), `git init` for plain folders; change-count badge on the header button
- **Run code from the chat**: shell, Python and Node snippets get a Run button; output streams live under the block with exit code and timing, and Run turns into Stop while it runs
- Chat / Code switch is now two icons (with tooltips)

## 0.4.0

- **Chat and Code modes**: a switch at the top of the sidebar. Chat is plain conversation with a flat chat list; Code is folders plus the agent
- **Files panel** (`⌘⇧E`): file tree that respects `.gitignore`, syntax-highlighted viewer, images, reveal in Finder, send `@path` to the composer
- **Browser panel** (`⌘⇧B`): minimal in-app browser with a start page that finds your running dev servers
- **AGENTS.md and CLAUDE.md** are both read every turn (plus CROO.md), shown under the composer; **`/init`** studies the project and writes AGENTS.md
- **Thinking**: reasoning streams as an expandable "Thought for…" row (Anthropic extended thinking with signed blocks round-tripped, Gemini thoughts, `reasoning_content` from OpenAI-compatible providers); saved with the chat
- **Syntax highlighting** in chat code blocks and the file viewer, light and dark
- **Model picker** under the composer lists the models your key can use, with search; type any id to use it
- **Settings redesign**: provider cards, masked keys, verified key updates, per-provider model lists; keys are now encrypted with the OS keychain
- **Tooltips** with keycaps for every button's shortcut

## 0.3.0

- Permission modes under the chat bar: Manual (ask for everything), Auto (ask only when it matters, with a conservative safe-command check), Bypass (never ask); `⇧Tab` cycles
- Built-in terminal panel: `⌘J` toggles, `⌘T` opens a new tab while it is focused; real shells via node-pty, themed to match
- New frog: the solid pixel-block look from the terminal, redrawn with lively animation (breathing, blinking, glancing, ribbiting, hopping, catching flies, sleeping) and reactions to thinking / working / waiting / done / errors

## 0.2.0

Croo is now a desktop app instead of a terminal CLI.

- Electron app (macOS first, Windows later) with a minimal sidebar of folders, each with its own chats
- Streaming markdown replies, tool rows, and inline diff / command approval cards
- The frog hops while tools run, looks around while thinking, and celebrates when done
- In-app provider setup with key checking; demo mode with no key
- Light and dark follow the system; native vibrancy sidebar on macOS
- Removed the terminal UI, the `croo` command and the npm package; core agent, providers, tools and saved chats are unchanged

## 0.1.4

- Setup checks the provider's model list and falls back if the default model isn't available for your key

## 0.1.3

- Existing profile with no key now shows the provider list instead of asking for an OpenAI key

## 0.1.2

- First run now shows a provider list (OpenAI, Anthropic, Gemini, Groq, OpenRouter, DeepSeek, xAI, Mistral, Together, Ollama, or any OpenAI-compatible URL); pick one and paste your key
- A profile with no key now asks for it instead of exiting with an error

## 0.1.1

- `croo --demo`: explore the interface with a scripted fake model, no API key needed (also offered on first run)

## 0.1.0

First release.

- Interactive streaming REPL and one-shot mode (`croo "prompt"`)
- Providers: OpenAI-compatible, Anthropic Messages, Google Gemini; named profiles
- Tools: read_file, write_file, edit_file, list_files, grep, bash
- Permission prompts with diffs, `--yolo`, `.gitignore` support, cwd sandbox
- `CROO.md` / `AGENTS.md` project instructions
- Local session history and `--continue`
- Themed UI, markdown rendering, spinner, and the Croo frog
