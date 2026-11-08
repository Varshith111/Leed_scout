/**
 * Build step: copy non-TypeScript assets into `dist`.
 *
 * `tsc` only emits `.js`, so the SQL migration files shipped next to
 * `MigrationRunner` have to be copied manually. `MigrationRunner` resolves them
 * relative to its own directory, which keeps `src` and `dist` behaving
 * identically.
 */
import { join } from 'node:path';

import { copy, pathExists } from 'fs-extra';

import { PROJECT_ROOT } from '../src/config/paths';

const ASSET_DIRECTORIES = [join('src', 'database', 'migrations')] as const;

async function main(): Promise<number> {
  for (const relativePath of ASSET_DIRECTORIES) {
    const source = join(PROJECT_ROOT, relativePath);

    if (!(await pathExists(source))) {
      console.error(`Asset directory missing: ${relativePath}`);
      return 1;
    }

    const destination = join(PROJECT_ROOT, relativePath.replace(/^src/, 'dist'));
    await copy(source, destination, { overwrite: true });
    console.log(`Copied ${relativePath} -> ${destination.replace(PROJECT_ROOT, '.')}`);
  }

  return 0;
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
