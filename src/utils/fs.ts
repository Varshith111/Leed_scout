import { mkdirSync, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Creates a directory (recursively) if it does not exist yet. */
export function ensureDirectorySync(directoryPath: string): string {
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }

  return directoryPath;
}

/** Async variant of {@link ensureDirectorySync}. */
export async function ensureDirectory(directoryPath: string): Promise<string> {
  await mkdir(directoryPath, { recursive: true });
  return directoryPath;
}

/** Creates the parent directory of a file path if needed. */
export async function ensureParentDirectory(filePath: string): Promise<string> {
  return ensureDirectory(dirname(filePath));
}

/** `true` when the given path exists on disk. */
export function pathExists(targetPath: string): boolean {
  return existsSync(targetPath);
}
