# Changelog

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
