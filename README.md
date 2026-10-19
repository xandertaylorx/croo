# Croo

A quick, minimal, open-source terminal AI coding agent. Bring your own API key (or a local model) and let a small frog help you code.

```
 ▄▄▄   ▄▄▄    “ribbit. ready when you are.”
██▄█▄▄▄█▄██   Croo v0.1.0
▀█▄▀▀▀▀▀▄█▀   gpt-4o · openai
 ▀▀     ▀▀    ~/projects/my-app
              /help for commands
```

- **Fully local.** No accounts, no login, no telemetry, no backend. Config lives in `~/.config/croo/config.json`.
- **Provider-agnostic.** OpenAI-compatible endpoints, Anthropic, and Google Gemini.
- **Tiny.** Zero runtime dependencies: native `fetch` and Node built-ins only.

Croo works with API keys and any OpenAI-compatible endpoint, including local models. It does not use anyone's consumer-subscription logins.

## Install

```bash
npm i -g croo-cli
```

Requires Node 20+.

## Quick start

```bash
cd your-project
croo                      # first run walks you through setup
croo "add a --verbose flag to the CLI"   # one-shot
croo --continue           # resume the last session in this directory
croo --profile local      # use a named profile
croo --yolo               # skip permission prompts (be careful)
croo --no-pet             # no frog
croo --demo               # look around with a fake model, no API key
```

Slash commands: `/help`, `/model` (list, `/model <name>` to switch, `/model add`), `/clear`, `/config`, `/exit`.
`Ctrl+C` cancels the current generation; a second `Ctrl+C` exits.

## Configuration

`~/.config/croo/config.json` (created with mode 600). API keys may live here or in env vars: `CROO_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`. Priority is the profile's `apiKey`, then `CROO_API_KEY`, then the provider's own variable.

```jsonc
{
  "activeProfile": "openai",
  "pet": true,
  "animations": true,
  "profiles": {
    "openai": { "type": "openai", "model": "gpt-4o" },
    "anthropic": { "type": "anthropic", "model": "claude-sonnet-4-5" },
    "gemini": { "type": "gemini", "model": "gemini-2.5-pro" },
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

Optional per-profile `inputPerMTok` / `outputPerMTok` (USD per million tokens) adds a cost estimate to the status line.

## Tools and permissions

| Tool | What it does | Asks first? |
| --- | --- | --- |
| `read_file` | Read a file with line numbers | no |
| `list_files` | List/glob files (respects `.gitignore`) | no |
| `grep` | Regex search (respects `.gitignore`) | no |
| `write_file` | Create or overwrite a file | yes, shows a diff |
| `edit_file` | Exact string replace | yes, shows a diff |
| `bash` | Run a shell command (120s timeout, truncated output) | yes, shows the command |

Prompts accept `y`, `n` or `a` (always, for that tool, this session). File tools cannot leave the current directory. Put project guidance in `CROO.md` or `AGENTS.md` and Croo will include it in its system prompt.

Sessions are saved as JSON under `~/.local/share/croo/sessions`.

## Development

```bash
npm install && npm test && npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- Custom pets: the `Pet` interface in `src/ui/pet.ts` is designed so you can drop in your own frames
- Idle animation at the prompt
- Context window management and compaction
- MCP support
- More tools (web fetch, multi-edit)

## License

MIT, see [LICENSE](LICENSE).

---

An Entity of The Tizzle Collective
