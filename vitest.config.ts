import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['web/src/**/*.test.ts', 'tests/platform/**/*.test.ts'] },
})
