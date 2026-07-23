import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  // Resolve cross-package `@layerflow/*` imports to source, not built `dist/`. Without this
  // `npm test` fails on a clean checkout (CI runs tests before build) and coverage would
  // measure stale artifacts instead of the code under test.
  resolve: {
    alias: {
      '@layerflow/core': src('core'),
      '@layerflow/react': src('react'),
      '@layerflow/react-native': src('react-native'),
      '@layerflow/expo-ui': src('expo-ui'),
      '@layerflow/gorhom': src('gorhom'),
      '@layerflow/testing': src('testing'),
    },
  },
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
