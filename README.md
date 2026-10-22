<div align="center">

# Croo

**A minimal desktop coding agent with a frog in it.**
Bring your own API key, or a local model. No accounts, no telemetry, no backend.

</div>

Croo is a small Mac app (Windows next) that gives each of your project folders its own chats. Ask it to read, search, edit and run things in a folder; every file write and shell command shows a diff or the exact command and waits for your OK.

## Run it

```bash
git clone https://github.com/xandertaylorx/croo && cd croo
npm install
npm run dev
```

First launch walks you through picking a provider and pasting a key, or choose **Just look around** for a scripted demo with no key.

Build a distributable with `npm run dist` (macOS `.dmg` and `.zip` in `release/`).

## Using it

- **Add a folder** with the `+` in the sidebar, `⌘O`, or by dropping a folder on the window.
- **New chat** in the current folder with `⌘N`. Chats are named after your first message and saved locally.
- **Approve changes** with the buttons on the card, `⌘↵` to allow, `esc` to deny. "Always allow" applies to that chat only.
- `⌘B` hides the sidebar, `⌘,` opens settings. Light and dark follow your system.

## Providers

OpenAI, Anthropic, Google Gemini, or anything OpenAI-compatible: OpenRouter, Groq, Together, DeepSeek, Mistral, xAI, Ollama, LM Studio, llama.cpp, vLLM. Keys are checked when you add them and stored in `~/.config/croo/config.json` (mode 600). Chats live in `~/.local/share/croo`.

Croo works with API keys and OpenAI-compatible endpoints. It does not use anyone's consumer-subscription logins.

## Project instructions

Put a `CROO.md` (or `AGENTS.md`) in a folder and Croo reads it at the start of every turn there.

## Tools

`read_file`, `write_file`, `edit_file`, `list_files`, `grep`, `bash`. File tools are confined to the chat's folder and respect `.gitignore`.

## Layout

```
src/main/       Electron main process + sandboxed preload bridge
src/renderer/   The UI: plain TypeScript and CSS, no framework (the frog is in frog.ts)
src/agent.ts    Model/tool loop         src/providers/   OpenAI, Anthropic, Gemini
src/tools/      File, search, shell     src/session.ts   Local chat history
```

MIT licensed.
