import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Component tests opt in per file with `@vitest-environment jsdom`.
    environment: 'node',
    include: ['packages/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./scripts/vitest-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['packages/*/src/**/*.{ts,tsx}'],
      // Barrels and type-only modules carry no runtime behavior to cover.
      exclude: ['packages/*/src/index.ts', 'packages/*/src/types.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
});
