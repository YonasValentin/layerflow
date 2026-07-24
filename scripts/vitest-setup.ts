import { afterEach, vi } from 'vitest';

// Restoration must not depend on a passing assertion. A test that throws before its trailing
// `vi.useRealTimers()` / `mockRestore()` would otherwise leak fake timers and console spies into
// every test after it, turning one real failure into a cascade of misleading ones.
afterEach(async () => {
  // Restored before RTL cleanup so unmount effects run against the real clock.
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Component tests opt into jsdom per file; unmount their trees between tests.
  // Skipped entirely in the node environment, where there is nothing to clean up.
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
