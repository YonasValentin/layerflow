import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const packageFiles = readdirSync('packages', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join('packages', entry.name, 'package.json'));
const rootVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const errors = [];
for (const file of packageFiles) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  if (!pkg.repository?.url || pkg.repository.url.includes('REPLACE_ME')) {
    errors.push(`${file}: replace repository.url before publishing`);
  }
  if (pkg.version === undefined) {
    errors.push(`${file}: missing version`);
  }
  if (pkg.private === true) continue;
  // publish.yml asserts the release tag equals the root version, so pinning every published
  // package to that version transitively enforces "tag == every published version".
  if (pkg.version !== rootVersion) {
    errors.push(`${file}: version ${pkg.version} does not match the root version ${rootVersion}`);
  }
  for (const field of ['homepage', 'author']) {
    if (pkg[field] === undefined) errors.push(`${file}: missing ${field}`);
  }
  if (!pkg.bugs?.url) errors.push(`${file}: missing bugs.url`);
  if (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0) {
    errors.push(`${file}: missing keywords`);
  }
}
// Configuring a trusted publisher per package on npm is a one-time human step
// documented in docs/releasing.md, not machine-checkable here.
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
