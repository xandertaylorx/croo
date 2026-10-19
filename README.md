<div align="center">

```
 ▄▄▄   ▄▄▄
██▄█▄▄▄█▄██
▀█▄▀▀▀▀▀▄█▀
 ▀▀     ▀▀
```

# Croo

**A tiny terminal coding agent with a frog in it.**
Bring your own API key, or a local model. No accounts, no telemetry, no backend.

[![npm](https://img.shields.io/npm/v/croo-cli?color=5ed67e&label=npm)](https://www.npmjs.com/package/croo-cli)
[![CI](https://github.com/xandertaylorx/croo/actions/workflows/ci.yml/badge.svg)](https://github.com/xandertaylorx/croo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-5ed67e)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-5ed67e)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/runtime%20deps-0-5ed67e)](package.json)

</div>

```
 ▄▄▄   ▄▄▄    “ribbit. ready when you are.”
██▄█▄▄▄█▄██   Croo v0.1.1
▀█▄▀▀▀▀▀▄█▀   gpt-4o · openai
 ▀▀     ▀▀    ~/projects/my-app
              /help for commands

  gpt-4o · ~/projects/my-app
› add a --verbose flag to the CLI

  ◇ read_file src/cli.ts ✓
  ✎ edit_file src/cli.ts
╭─ edit_file src/cli.ts ─────────────────────────
│ 12   const args = parseArgs(process.argv)
│ 13 + const verbose = args.verbose
╰ Allow? [y]es / [n]o / [a]lways
```

## Why Croo

- **Fully local.** Your config and history stay on your machine, in `~/.config/croo` and `~/.local/share/croo`.
- **Bring your own model.** OpenAI, Anthropic, Google Gemini, or anything OpenAI-compatible: OpenRouter, Groq, Together, DeepSeek, Mistral, Ollama, LM Studio, llama.cpp, vLLM.
- **Small and readable.** TypeScript, zero runtime dependencies, native `fetch`. You can read the whole thing in an afternoon.
- **You stay in control.** Every file write and shell command shows a diff or the exact command and waits for your OK.
- **A little charm.** A pixel frog lives in your terminal. It blinks, hops while tools run, and reacts when things go well or badly. `--no-pet` sends it home.

> Croo works with API keys and any OpenAI-compatible endpoint, including local models. It does not use anyone's consumer-subscription logins.

## Install

```bash
npm i -g croo-cli
```

Needs Node 20 or newer. The command is `croo`.

## Try it without an API key

```bash
croo --demo
```

A scripted fake model walks you through the interface: streaming markdown, tool cards, the spinner, and a diff permission prompt. Nothing leaves your machine and nothing is saved.

## Quick start

```bash
cd your-project
croo                       # first run walks you through setup
croo "fix the failing test"   # one-shot: run a task and exit
croo --continue            # resume the last session in this directory
croo --profile local       # use a named profile
```

| Flag | What it does |
| --- | --- |
| `-p, --profile <name>` | Use a named profile from the config |
| `-c, --continue` | Resume the last session in this directory |
| `--yolo` | Skip permission prompts (be careful) |
| `--no-pet` | Hide the frog |
| `--demo` | Try the interface with a fake model |
| `-v, --version` / `-h, --help` | Version / help |

**In the session:** `/help` · `/model` (list; `/model <name>` switches; `/model add`) · `/clear` · `/config` · `/exit`.
`Ctrl+C` cancels the current generation. A second `Ctrl+C` exits.

## Configure providers

Config lives at `~/.config/croo/config.json` and is created with mode `600`. Add as many named profiles as you like and switch with `/model` or `--profile`.

```jsonc
{
  "activeProfile": "openai",
  "pet": true,
  "animations": true,
  "profiles": {
    "openai":    { "type": "openai",    "model": "gpt-4o" },
    "anthropic": { "type": "anthropic", "model": "claude-sonnet-4-5" },
    "gemini":    { "type": "gemini",    "model": "gemini-2.5-pro" },
    "openrouter": {
      "type": "openai",
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "anthropic/claude-sonnet-4.5"
    },
    "ollama": {
      "type": "openai",
      "baseUrl": "http://localhost:11434/v1",
      "model": "qwen2.5-coder"
    }
  }
}
```

**API keys** can go in the profile (`"apiKey": "..."`) or in the environment. Lookup order: the profile's `apiKey`, then `CROO_API_KEY`, then the provider's own variable (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`). Local servers like Ollama need no key.

Optional per-profile `inputPerMTok` / `outputPerMTok` (USD per million tokens) adds a cost estimate to the status line.

## Tools and permissions

| Tool | What it does | Asks first? |
| --- | --- | --- |
| `read_file` | Read a file with line numbers | no |
| `list_files` | List or glob files (respects `.gitignore`) | no |
| `grep` | Regex search (respects `.gitignore`) | no |
| `write_file` | Create or overwrite a file | yes, shows a diff |
| `edit_file` | Exact string replace | yes, shows a diff |
| `bash` | Run a shell command (120s timeout, output truncated) | yes, shows the command |

Answer `y`, `n`, or `a` (always allow that tool for this session). File tools can never leave the current directory, symlinks included.

**Project instructions:** drop a `CROO.md` or `AGENTS.md` in your project and Croo adds it to its system prompt.

**Sessions** are saved as plain JSON in `~/.local/share/croo/sessions`.

## Look and feel

Colours come from one file, `src/ui/theme.ts`. Croo uses 24-bit colour when your terminal supports it and falls back to 256 or 16. It respects `NO_COLOR`, and turns off colour and animation when output is piped, so `croo "..." > out.txt` stays clean. Set `"animations": false` or `"pet": false` in the config to calm things down.

## Development

```bash
git clone https://github.com/xandertaylorx/croo && cd croo
npm install
npm test            # vitest
npm run build       # dist/cli.js
node dist/cli.js --demo
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome.

## Roadmap

- [ ] Custom pets: the `Pet` interface in `src/ui/pet.ts` is built so you can drop in your own frames
- [ ] Idle animation at the prompt
- [ ] Context-window management and compaction
- [ ] MCP support
- [ ] More tools: web fetch, multi-edit

## License

[MIT](LICENSE), Copyright (c) 2026 Xander Taylor. Free to use, change and share.

<div align="center">

<sub>An Entity of The Tizzle Collective</sub>

</div>
