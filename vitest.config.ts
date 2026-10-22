import { defineConfig } from 'vitest/config'

// The git tests start real processes, which can take longer than 5s on a busy CI runner.
export default defineConfig({ test: { testTimeout: 30_000 } })
