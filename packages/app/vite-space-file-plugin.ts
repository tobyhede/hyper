import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * File input remains only as the prototype importer that seeds the configured
 * backend. There is deliberately no browser write endpoint: live edits commit
 * through SpaceBackend, and exporting files is a separate CLI concern.
 */

const VIRTUAL_ID = 'virtual:space-file';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const SPACE_DIR = process.env['SPACE_DIR']
  ? resolve(process.cwd(), process.env['SPACE_DIR'])
  : null;

const spaceFilePath = (dir: string): string => `${dir}/space.json`;

const markdownIn = (dir: string, prefix: string): { path: string; text: string }[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => ({
      path: `${prefix}${entry.name}`,
      text: readFileSync(`${dir}/${entry.name}`, 'utf8'),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
};

const readCardFiles = (dir: string): { path: string; text: string }[] => [
  ...markdownIn(dir, ''),
  ...markdownIn(`${dir}/cards`, 'cards/'),
];

const spaceModule = (dir: string | null): string => {
  if (dir === null || !existsSync(spaceFilePath(dir))) {
    return [
      `import { newSpace } from '@project/graph';`,
      `const minted = newSpace();`,
      `export const spaceFile = minted.file;`,
      `export const cardFiles = minted.cardFiles;`,
    ].join('\n');
  }
  return [
    `export const spaceFile = ${readFileSync(spaceFilePath(dir), 'utf8')};`,
    `export const cardFiles = ${JSON.stringify(readCardFiles(dir))};`,
  ].join('\n');
};

export function spaceFilePlugin(): Plugin {
  return {
    name: 'space-file-import',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      return id === RESOLVED_ID ? spaceModule(SPACE_DIR) : undefined;
    },
  };
}
