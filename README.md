<div align="center">

# Croo

**A minimal desktop coding agent with a frog in it.**
Bring your own API key, or a local model. No accounts, no telemetry, no backend.

</div>

Croo is a small Mac app (Windows next). **Code** mode gives each of your project folders its own chats and lets the agent read, search, edit and run things in it. **Chat** mode is a plain conversation with no folder and no tools. Every file write and shell command can show a diff or the exact command and wait for your OK, depending on the permission mode you pick.

## Run it

```bash
git clone https://github.com/xandertaylorx/croo && cd croo
npm install
npm run dev
```

First launch walks you through picking a provider and pasting a key, or choose **Just look around** for a scripted demo with no key.

Build a distributable with `npm run dist` (macOS `.dmg` and `.zip` in `release/`).

## Chat and Code

The switch at the top of the sidebar changes what the app is for:

- **Code** (`⌘2`): the sidebar lists your folders, each with its own chats. The agent has tools, the terminal, the file browser and the in-app browser.
- **Chat** (`⌘1`): the sidebar is just a list of conversations. No folders, no tools, no permission prompts.

## Code mode

- **Add a folder** with the `+` in the sidebar, `⌘O`, or by dropping a folder on the window. `⌘N` starts a chat in the current folder.
- **Permission modes** sit under the chat bar (`⇧Tab` cycles them):
  - **Manual** asks before everything, even reading a file.
  - **Auto** (default) lets reads, edits inside the folder and known-safe commands (`ls`, `git status`, `npm test`, …) run; anything else asks.
  - **Bypass** never asks. Use it only in folders you can afford to break.
- **Approve changes** with the buttons on the card, `⌘↵` to allow, `esc` to deny.
- **Terminal** (`⌘J`): a real shell in the current folder. `⌘T` opens a new tab while the terminal is focused, `⌘⇧[` / `⌘⇧]` switch tabs, `⌘K` clears.
- **Files** (`⌘⇧E`): a tree of the folder (it respects `.gitignore`) with a syntax-highlighted viewer. Send a file to the composer as `@path`, or reveal it in Finder.
- **Browser** (`⌘⇧B`): a minimal in-app browser for previewing what you build. The start page lists dev servers running on your machine. Anything you type that is not an address is searched with DuckDuckGo.
- Hover any button to see what it does and its shortcut.

## Project instructions and `/init`

Croo reads **`AGENTS.md`**, **`CLAUDE.md`** and **`CROO.md`** from a folder at the start of every turn, and shows which ones it found under the composer. If a folder has none, type **`/init`**: Croo reads the README, manifests, CI config and source, then writes an `AGENTS.md` with the build and test commands, the architecture that takes several files to understand, and project-specific gotchas. If `AGENTS.md` or `CLAUDE.md` already exists it improves that file instead.

## Thinking, code and models

- **Thinking**: when the model streams its reasoning (Claude extended thinking, Gemini thoughts, DeepSeek/Groq/OpenRouter/Ollama reasoning), it appears as a quiet "Thought for 4s" row you can expand. It is saved with the chat.
- **Code blocks** are syntax highlighted (JS/TS, Python, Go, Rust, Swift, Java, C/C++, SQL, shell, JSON, YAML, CSS, HTML and more) with a copy button.
- **Models**: the model chip under the composer lists the models your key can actually use, fetched from the provider. Search, arrow keys and `↵` to switch, or type any id to use it as-is.

## Providers and keys

OpenAI, Anthropic, Google Gemini, or anything OpenAI-compatible: OpenRouter, Groq, Together, DeepSeek, Mistral, xAI, Ollama, LM Studio, llama.cpp, vLLM. In **Settings** (`⌘,`) each provider is a card showing its masked key and where it is stored, with **Update key** (verified before it is saved), a per-provider model list, and remove.

Keys are encrypted with the OS keychain before they are written to `~/.config/croo/config.json`. Chats live in `~/.local/share/croo`. The only network calls are to the provider you choose.

Croo works with API keys and OpenAI-compatible endpoints. It does not use anyone's consumer-subscription logins.

## Tools

`read_file`, `write_file`, `edit_file`, `list_files`, `grep`, `bash`. File tools are confined to the chat's folder and respect `.gitignore`.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘1` / `⌘2` | Chat / Code mode |
| `⌘N` | New chat |
| `⌘O` | Add folder |
| `⌘B` | Toggle sidebar |
| `⌘J` | Toggle terminal (`⌘T` new tab while focused) |
| `⌘⇧E` | Toggle files |
| `⌘⇧B` | Toggle browser |
| `⇧Tab` | Cycle permission mode |
| `⌘↵` / `esc` | Allow / deny an approval |
| `⌘,` | Settings |

Poke the frog. Leave it alone long enough and it falls asleep.

## Layout

```
src/main/       Electron main process, sandboxed preload bridge, terminal (node-pty)
src/renderer/   The UI: plain TypeScript and CSS, no framework
                (frog.ts is the mascot, side.ts the files/browser panel, terminal.ts the shell)
src/agent.ts    Model/tool loop         src/providers/   OpenAI, Anthropic, Gemini
src/tools/      File, search, shell     src/session.ts   Local chat history
```

MIT licensed.
