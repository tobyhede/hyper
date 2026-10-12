import { uuidSchema, type Resource, type UUID } from '@project/core';
import type { ResourceFile } from '../src/index';

/**
 * A Resource's files as an author writes them: its Resource file
 * `resources/<id>.json`, and for a Markdown Resource the `<id>.md` sidecar its
 * locator names. Tests build these rather than resource objects, because that
 * is what `loadSpace` takes. Each helper returns every file of one Resource, so
 * a list of Resources is spread into one list of files.
 *
 * The JSON is written here with `JSON.stringify` rather than through
 * `serializeResource`, so the tests exercise intake against files the codec
 * under test did not produce.
 */

/** A value JSON can write; `undefined` is a key JSON leaves out. */
export type Json =
  string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json | undefined };

function file(id: string, title: string, kind: string, content: Json): ResourceFile {
  return {
    path: `resources/${id}.json`,
    text: `${JSON.stringify({ id, title, kind, content }, null, 2)}\n`,
  };
}

export function resourceFile(
  id: string,
  title = defaultTitle(id),
  body = '',
): readonly ResourceFile[] {
  return [
    file(id, title, 'markdown', { path: `${id}.md`, mediaType: 'text/markdown' }),
    { path: `resources/${id}.md`, text: body },
  ];
}

/** Any kind's Resource file, its content written as given. */
export function jsonResourceFile(
  id: string,
  title: string,
  kind: string,
  content: Json,
): readonly ResourceFile[] {
  return [file(id, title, kind, content)];
}

export function referenceFile(id: string, title: string, target: string): readonly ResourceFile[] {
  return [file(id, title, 'reference', { target })];
}

export function imageFile(id: string, title: string, url: string): readonly ResourceFile[] {
  return [file(id, title, 'image', { url })];
}

/**
 * Loaded resources, for the tests that deliberately build a broken graph and hand it
 * straight to `validateReferences` — `loadSpace` would reject these before they
 * ever reached it.
 */

export function resource(id: string, title = defaultTitle(id), body = ''): Resource {
  return { id: uuid(id), title, kind: 'markdown', content: { source: body } };
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
  return { id: uuid(id), title, kind: 'reference', content: { target: uuid(target) } };
}
