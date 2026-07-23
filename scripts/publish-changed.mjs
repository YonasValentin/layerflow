import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Publishes each public workspace package only when its exact name@version is not already
// on the registry. This makes `Publish` idempotent and per-package: a release that bumps
// only some packages no longer 403s on the unchanged ones (as `npm publish --workspaces`
// did), and a re-run after a partial failure resumes instead of failing on what shipped.

const packages = readdirSync('packages', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => JSON.parse(readFileSync(join('packages', entry.name, 'package.json'), 'utf8')))
  .filter((pkg) => typeof pkg.name === 'string' && pkg.private !== true);

for (const pkg of packages) {
  let published = '';
  try {
    published = execFileSync('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // `npm view` exits non-zero when the version does not exist yet — that is the publish signal.
  }

  if (published === pkg.version) {
    process.stdout.write(`skip    ${pkg.name}@${pkg.version} (already published)\n`);
    continue;
  }

  process.stdout.write(`publish ${pkg.name}@${pkg.version}\n`);
  execFileSync('npm', ['publish', '--workspace', pkg.name, '--access', 'public', '--provenance'], {
    stdio: 'inherit',
  });
}
