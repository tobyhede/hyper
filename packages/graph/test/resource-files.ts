import { stringify as stringifyYaml } from 'yaml';
import { uuidSchema, type Resource, type UUID } from '@project/core';
import type { ResourceFile } from '../src/index';

/**
 * Resource files as an author writes them: frontmatter, then body, one file per resource
 * (ADR 0020). Tests build these rather than resource objects, because that is what
 * `loadSpace` now takes.
 *
 * The frontmatter goes through `stringify` rather than a template string, so a
 * generated title carrying a YAML indicator (`,`, `:`, `-`) is quoted rather
 * than mis-parsed. Hand-rolling the emitting side would put the property tests
 * to work on the helper's escaping instead of on `loadSpace`.
 */

function file(id: string, frontmatter: Record<string, string>, body: string): ResourceFile {
  return { path: `resources/${id}.md`, text: `---\n${stringifyYaml(frontmatter)}---\n\n${body}` };
}

export function resourceFile(id: string, title = defaultTitle(id), body = ''): ResourceFile {
  return file(id, { id, title }, body);
}

export function referenceFile(id: string, title: string, target: string): ResourceFile {
  return file(id, { id, title, kind: 'reference', target }, '');
}

/**
 * Loaded resources, for the tests that deliberately build a broken graph and hand it
 * straight to `validateReferences` — `loadSpace` would reject these before they
 * ever reached it.
 */

export function resource(id: string, title = defaultTitle(id), body = ''): Resource {
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

export function reference(id: string, title: string, target: string): Resource {
  return { id: uuid(id), title, kind: 'reference', target: uuid(target) };
}
