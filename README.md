<div align="center">

<img src="build/icon.png" width="112" alt="Croo, a pixel frog" />

# Croo

**A minimal desktop coding agent with a frog in it.**<br>
Bring your own API key, or a local model. No accounts, no telemetry, no backend.

![macOS](https://img.shields.io/badge/macOS-Windows%20next-5ed67e?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-5ed67e?style=flat-square)
![Electron](https://img.shields.io/badge/built%20with-Electron-5ed67e?style=flat-square)

[Website](https://ai.crooli.com/) · [Latest release](https://github.com/xandertaylorx/croo/releases/latest) · [Changelog](CHANGELOG.md) · [Features](#features) · [Run it](#run-it) · [Providers](#providers-and-keys) · [Shortcuts](#shortcuts)

<br>

<img src="docs/screenshots/git.png" alt="Croo: chat on the left, the Git panel with an inline diff on the right" width="920" />

</div>

<br>

**Code** mode gives each project folder its own chats and lets the agent read, search, edit and run things in it. **Chat** mode is a plain conversation with no folder and no tools. You decide how much the agent may do on its own, and everything it does is visible: diffs, commands, output, reasoning, time and tokens.

## What’s new in 0.19.0

Chat mode answers with **cards**: a calculator, the **weather**, **maps** for places and routes, **live flights**, conversions, world clocks and **charts**. Only what you ask about is looked up, on free public services; see the [changelog](CHANGELOG.md).

## What’s new in 0.18.0

Chat mode can now **read web pages**, and replies written from them list their **sources** as clickable chips with each site's own icon.

## What’s new in 0.17.0

The chat got a polish: tool calls hang on a **timeline**, reasoning opens as dim **steps**, the summary behind a compaction is a **card** you can read, replies show their **model and cost** on hover, fetched pages are **source chips**, and a **jump to latest** button appears when you scroll up. See the [changelog](CHANGELOG.md).

## What’s new in 0.16.0

In 0.16.1, Croo's task list sits above the message box and ticks off as it works, instead of appearing in the chat each time it changes.

**Undo** any turn's file changes, or restore files to before any message. **Plan mode** researches without touching anything and asks you to approve a plan first. The agent can **check its own work in a real browser**: it starts your dev server in the background, opens the page, clicks around and looks at screenshots. Edited files are **type-checked right away**. **Subagents** handle broad research in parallel. You can extend Croo with your own **slash commands, skills and hooks**. See the [changelog](CHANGELOG.md) for details.

## Features

| | |
| --- | --- |
| **Chat and Code** | Two icons at the top of the sidebar. Code lists your folders with a chat history each; Chat is a flat list of conversations. |
| **MCP servers** | Settings → MCP connects Model Context Protocol servers (a local command or a remote URL). Paste a command, a URL, or the usual `mcpServers` JSON. Their tools are available to the agent in Code mode. |
| **Long tasks** | Older messages are summarized automatically as the context fills up, and a ring at the top right of the chat shows how full it is. Claude's prompt caching keeps long runs cheap. |
| **Permission modes** | **Manual** asks before everything. **Auto** runs reads, edits in the folder and known-safe commands, and asks about the rest. **Plan** only looks around, then asks you to approve a plan before anything changes. **Bypass** never asks. `⇧Tab` cycles. |
| **Undo** | Croo saves each file before its file tools change it. **Undo changes** reverts the last turn; ↶ on any message restores files to before it, and editing a message can undo everything since. |
| **Checks its own work** | Edited TypeScript, JavaScript, Python, JSON and Go files are checked right away, and errors go straight back to the agent. Dev servers run in the background, and a built-in `browser` tool opens them, clicks through them, reads console errors and takes screenshots. |
| **Subagents** | The `task` tool sends broad research to read-only subagents with fresh context, several at once, and only their reports come back. |
| **Commands, skills, hooks** | `.croo/commands/*.md` become `/commands`. `.croo/skills/*/SKILL.md` are skills the agent loads when relevant. `.croo/hooks.json` runs your scripts before or after tools, on each prompt, or before the agent stops. Project hooks run only once you trust them. The `.claude/` folders work too. |
| **Git, built in** | Branch and sync state, changed files with `+/−` counts, inline diffs, pick what to commit, **Commit**, **Push**, **Pull**. No remote yet? **Publish** connects one by URL or `owner/repo`, or creates it on GitHub with `gh`. Failures come with a plain-language fix. |
| **Run code from the chat** | Shell, Python and Node snippets in a reply get a **Run** button. Output streams under the block with exit code and timing, and **Stop** while it runs. |
| **Files and Browser** | A `.gitignore`-aware file tree with a syntax-highlighted viewer that wraps long lines, and an in-app browser whose start page finds the dev servers running on your machine. |
| **Terminal** | A real shell in the folder (`⌘J`), with tabs (`⌘T`). |
| **Thinking, time and tokens** | Reasoning streams into an expandable "Thought for 4s" row. A live clock and token count run while the agent works. |
| **Models and effort** | The model chip lists what your key can actually use. The **Effort** control appears for models that have one and is clamped to what each model accepts. |
| **Attach and mention** | Paste or drop images and files into the message box, or use the paperclip. Type `@` to pick a file from the folder and it is sent along with your message. Big images are scaled down first. |
| **Search** | `⌘K` finds chats (by title or what was said), files and actions. |
| **Edit and retry** | Edit any message and resend (everything after it is replaced), or **Retry** the last reply. |
| **Cost** | Time, tokens and an estimated cost under each reply. Claude prices are built in, set your own for other providers, local models are free. |
| **Notifications and updates** | A system notification when a task finishes or needs your OK while Croo is in the background. A notice at the bottom left of the sidebar when a new version is out; download and install progress appears there and in Settings → About. |
| **Project instructions** | Reads `AGENTS.md`, `CLAUDE.md` and `CROO.md` every turn. `/init` studies the project and writes `AGENTS.md`. |
| **A frog** | Pixel art that breathes, blinks, hops, catches flies, falls asleep, and reacts to thinking, working, waiting, done and errors. Click it. |

<div align="center">
<img src="docs/screenshots/chat.png" alt="A chat with a runnable code block and its output" width="49%" />
<img src="docs/screenshots/settings.png" alt="Settings: permissions and reasoning effort" width="49%" />
</div>

## Run it

```bash
git clone https://github.com/xandertaylorx/croo && cd croo
npm install
npm run dev
```

**Install on a Mac** (Apple Silicon) with one command, no Gatekeeper warning:

```bash
curl -fsSL https://ai.crooli.com/install.sh | bash
```

If you download the `.dmg` instead, macOS will say Croo is "damaged" because it isn't notarized; run `xattr -cr /Applications/Croo.app` once.

**No key?** Download the built-in local model (Qwen3 4B, ~2.5 GB) from Settings → Providers or the first-run screen; Croo runs it on your Mac itself.

First launch walks you through picking a provider and pasting a key, or choose **Just look around** for a scripted demo with no key. Build a distributable with `npm run dist` (a macOS `.dmg` and `.zip` in `release/`).

## Using it

- **Add a folder** with the `+` in the sidebar, `⌘O`, or by dropping one on the window. `⌘N` starts a chat.
- **Approve changes** with the buttons on the card, `⌘↵` to allow, `esc` to deny.
- **Hover** any button for its name and shortcut.
- **Small window?** The sidebar steps aside while a side panel is open, and nothing needs horizontal scrolling.
- **Poke the frog.** Leave it alone long enough and it falls asleep.

### Git

Tick the files you want, write a message, **Commit** (`⌘↵`), then **Push**. A new branch is published for you. **Pull** is fast-forward only, so it never makes a surprise merge. If a folder is not a repository, one click runs `git init`.

### Reasoning

When the model streams its reasoning (Claude, Gemini, and DeepSeek, Groq, OpenRouter or Ollama style reasoning), it shows as a quiet row you can expand, and is saved with the chat. Claude 4.6 and later think adaptively, older models use a token budget, and effort levels are sent only where a model accepts them. If an API refuses a setting, Croo drops it, remembers that, and carries on.

## Providers and keys

OpenAI, Anthropic, Google Gemini, or anything OpenAI-compatible: OpenRouter, Groq, Together, DeepSeek, Mistral, xAI, Ollama, LM Studio, llama.cpp, vLLM. **Settings** (`⌘,`) shows each provider as a card with its masked key, **Update** (verified before it is saved), and a model list.

Keys are encrypted with the OS keychain before they are written to `~/.config/croo`. Chats live in `~/.local/share/croo`. The only network calls are to the provider you choose. Croo works with API keys and OpenAI-compatible endpoints. It does not use anyone's consumer-subscription logins.

## Shortcuts

| Shortcut | Action | Shortcut | Action |
| --- | --- | --- | --- |
| `⌘1` / `⌘2` | Chat / Code | `⌘J` | Terminal (`⌘T` new tab) |
| `⌘N` | New chat | `⌘⇧E` | Files |
| `⌘O` | Add folder | `⌘⇧G` | Git |
| `⌘B` | Sidebar | `⌘⇧B` | Browser |
| `⌘K` | Search | `@` | Mention a file |
| `⇧Tab` | Permission mode | `⌘↵` / `esc` | Allow / deny |
| `⌘,` | Settings | `/init` | Write `AGENTS.md` |
| `/` | Your custom commands | | |

## Releases and updates

Update `CHANGELOG.md` and `README.md`, bump the version in `package.json` and `package-lock.json` with `npm version <version> --no-git-tag-version`, and commit. Push the commit and matching version tag; GitHub Actions checks types, runs tests, builds the macOS app and attaches the installers to a GitHub Release:

```bash
git tag v0.19.0
git push origin main v0.19.0
```

The app checks the latest release on launch and every few hours and shows "Croo x.y.z is out" at the bottom left; clicking **Update and restart** downloads the update, shows download and install progress, replaces Croo and relaunches it. If Croo cannot write to its app folder, the button says so and you download the update yourself. Builds are unsigned and not notarized (see `.github/workflows/release.yml`); use the one-line installer above, or run `xattr -cr /Applications/Croo.app` after a manual download if macOS reports the app as “damaged”.

## Layout

```
src/main/       Electron main process, sandboxed preload bridge, terminal (node-pty), git, code runner
src/renderer/   The UI: plain TypeScript and CSS, no framework (frog.ts is the mascot)
src/agent.ts    Model and tool loop        src/providers/   OpenAI, Anthropic, Gemini
src/tools/      File, search (ripgrep), shell and background jobs, web fetch, task list, diagnostics, plan/task/skill
src/compact.ts  Context compaction         src/mcp.ts       MCP client (stdio and HTTP)
src/checkpoint.ts  Undo for file edits     src/hooks.ts     User hooks     src/commands.ts  Slash commands and skills
src/main/agentbrowser.ts  The browser the agent drives
src/effort.ts   Per-model reasoning settings
```

MIT licensed.
