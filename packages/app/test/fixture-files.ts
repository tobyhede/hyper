import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = join(dirname(dirname(fileURLToPath(import.meta.url))), 'fixture');

/** Every file under `root`, by path relative to it with `/` between segments. */
const readTree = (root: string): Map<string, Uint8Array> => {
  const files = new Map<string, Uint8Array>();
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.set(relative(root, path), new Uint8Array(readFileSync(path)));
    }
  };
  walk(root);
  return files;
};

/** Every tracked file of `packages/app/fixture`, which is exactly the set Importing reads there. */
export const fixtureFiles = (): Map<string, Uint8Array> => readTree(FIXTURE);
