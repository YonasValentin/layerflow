import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packagesRoot = fileURLToPath(new URL('../packages/', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const name of readdirSync(packagesRoot)) {
  const directory = join(packagesRoot, name);
  if (!statSync(directory).isDirectory()) continue;
  execFileSync(npm, ['pack', '--dry-run', '--json'], {
    cwd: directory,
    stdio: 'inherit',
  });
}
