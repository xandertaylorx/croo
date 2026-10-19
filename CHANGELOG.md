# Changelog

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
