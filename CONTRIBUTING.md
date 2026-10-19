# Contributing

Thanks for helping! Croo aims to stay small and readable, so please keep changes focused.

```bash
git clone https://github.com/xandertaylorx/croo && cd croo
npm install
npm test          # vitest
npm run typecheck
npm run build     # outputs dist/cli.js
node dist/cli.js
```

Guidelines:

- Prefer Node built-ins and native `fetch` over new dependencies. Runtime dependencies should stay at zero.
- Add or update tests for behaviour changes (`test/`).
- All colours live in `src/ui/theme.ts`; the pet lives in `src/ui/pet.ts`.
- Never commit API keys, tokens or personal config.
- Open an issue before large changes.

By contributing you agree your work is released under the MIT license.
