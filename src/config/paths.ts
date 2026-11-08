import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * Project root resolution.
 *
 * This file lives at `<root>/src/config/paths.ts` during development and at
 * `<root>/dist/config/paths.js` after a build — two levels below the package
 * root in both cases. Runtime directories (logs, output, screenshots) are
 * anchored to the package root rather than `process.cwd()` so the CLI behaves
 * identically no matter which directory it is invoked from.
 */
export const PROJECT_ROOT: string = resolve(__dirname, '..', '..');

/** Resolves a possibly-relative path against the project root. */
export function resolveFromRoot(targetPath: string): string {
  return isAbsolute(targetPath) ? targetPath : join(PROJECT_ROOT, targetPath);
}

/** Reads the package version, falling back to `0.0.0` if it cannot be read. */
export function readPackageVersion(): string {
  try {
    const raw = readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
