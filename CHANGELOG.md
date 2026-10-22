# Changelog

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
