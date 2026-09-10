import { stringify as stringifyYaml } from 'yaml';
import { uuidSchema, type Thing, type UUID } from '@project/core';
import type { ThingFile } from '../src/index';

/**
 * Thing files as an author writes them: frontmatter, then body, one file per thing
 * (ADR 0020). Tests build these rather than thing objects, because that is what
 * `loadSpace` now takes.
 *
 * The frontmatter goes through `stringify` rather than a template string, so a
 * generated title carrying a YAML indicator (`,`, `:`, `-`) is quoted rather
 * than mis-parsed. Hand-rolling the emitting side would put the property tests
 * to work on the helper's escaping instead of on `loadSpace`.
 */

function file(id: string, frontmatter: Record<string, string>, body: string): ThingFile {
  return { path: `things/${id}.md`, text: `---\n${stringifyYaml(frontmatter)}---\n\n${body}` };
}

export function thingFile(id: string, title = defaultTitle(id), body = ''): ThingFile {
  return file(id, { id, title }, body);
}

export function aliasFile(id: string, title: string, target: string): ThingFile {
  return file(id, { id, title, kind: 'alias', target }, '');
}

/**
 * Loaded things, for the tests that deliberately build a broken graph and hand it
 * straight to `validateReferences` — `loadSpace` would reject these before they
 * ever reached it.
 */

export function thing(id: string, title = defaultTitle(id), body = ''): Thing {
  return { id: uuid(id), title, kind: 'markdown', body };
}

export const uuid = (value: string): UUID => uuidSchema.parse(value);

const DEFAULT_TITLES = new Map([
  ['00000000-0000-4000-8000-000000000002', 'A'],
  ['00000000-0000-4000-8000-000000000003', 'B'],
  ['00000000-0000-4000-8000-000000000005', 'C'],
  ['00000000-0000-4000-8000-000000000006', 'D'],
]);

function defaultTitle(id: string): string {
  return DEFAULT_TITLES.get(id) ?? id.toUpperCase();
}

export function alias(id: string, title: string, target: string): Thing {
  return { id: uuid(id), title, kind: 'alias', target: uuid(target) };
}
