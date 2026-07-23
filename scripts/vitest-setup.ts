import { afterEach } from 'vitest';

// Component tests opt into jsdom per file; unmount their trees between tests.
// Skipped entirely in the node environment, where there is nothing to clean up.
afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
