# Contributing

Thanks for helping! Croo aims to stay small and readable, so please keep changes focused.

```bash
git clone https://github.com/xandertaylorx/croo && cd croo
npm install
npm run dev       # build and launch the app
npm test          # vitest
npm run typecheck
```

Guidelines:

- Prefer Node built-ins and native `fetch` over new dependencies. The only runtime dependency is `node-pty` (for the terminal panel); Electron, xterm and the build tools are dev-only.
- Add or update tests for behaviour changes (`test/`).
- Colours and layout live in `src/renderer/styles.css`; the frog is drawn in `src/renderer/frog.ts`.
- Never commit API keys, tokens or personal config.
- Open an issue before large changes.

By contributing you agree your work is released under the MIT license.
