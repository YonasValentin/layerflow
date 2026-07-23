import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const packageFiles = readdirSync('packages', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join('packages', entry.name, 'package.json'));
const errors = [];
for (const file of packageFiles) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  if (!pkg.repository?.url || pkg.repository.url.includes('REPLACE_ME')) {
    errors.push(`${file}: replace repository.url before publishing`);
  }
  if (pkg.version === undefined) {
    errors.push(`${file}: missing version`);
  }
}
// Configuring a trusted publisher per package on npm is a one-time human step
// documented in docs/releasing.md, not machine-checkable here.
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
