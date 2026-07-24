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

// Readdir order is alphabetical, which would ship expo-ui and gorhom before the react package
// they depend on. Derive the order from the manifests instead of duplicating the hard-coded
// list in the root build script, so a new package cannot be added in the wrong slot.
const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
const ordered = [];
const done = new Set();
const visit = (pkg, stack) => {
  if (done.has(pkg.name)) return;
  if (stack.has(pkg.name)) throw new Error(`workspace dependency cycle at ${pkg.name}`);
  stack.add(pkg.name);
  const deps = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies };
  for (const name of Object.keys(deps)) {
    const dep = byName.get(name);
    if (dep !== undefined) visit(dep, stack);
  }
  stack.delete(pkg.name);
  done.add(pkg.name);
  ordered.push(pkg);
};
for (const pkg of packages) visit(pkg, new Set());

for (const pkg of ordered) {
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
  try {
    execFileSync(
      'npm',
      ['publish', '--workspace', pkg.name, '--access', 'public', '--provenance'],
      {
        stdio: 'pipe',
        encoding: 'utf8',
      },
    );
  } catch (error) {
    // The `npm view` pre-check can miss a version that was just published elsewhere
    // (registry read replicas lag the write). If publish then reports the version is
    // already there, treat it as done rather than failing the release; rethrow anything else.
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (/cannot publish over|previously published/i.test(output)) {
      process.stdout.write(`skip    ${pkg.name}@${pkg.version} (already published; race)\n`);
      continue;
    }
    process.stderr.write(output);
    throw error;
  }
}
