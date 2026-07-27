import { stringify as stringifyYaml } from 'yaml';
import type { Card } from '@project/core';
import type { CardFile } from '../src/index';

/**
 * Card files as an author writes them: frontmatter, then body, one file per card
 * (ADR 0020). Tests build these rather than card objects, because that is what
 * `loadSpace` now takes.
 *
 * The frontmatter goes through `stringify` rather than a template string, so a
 * generated title carrying a YAML indicator (`,`, `:`, `-`) is quoted rather
 * than mis-parsed. Hand-rolling the emitting side would put the property tests
 * to work on the helper's escaping instead of on `loadSpace`.
 */

function file(id: string, frontmatter: Record<string, string>, body: string): CardFile {
  return { path: `cards/${id}.md`, text: `---\n${stringifyYaml(frontmatter)}---\n\n${body}` };
}

export function cardFile(id: string, title = id.toUpperCase(), body = ''): CardFile {
  return file(id, { id, title }, body);
}

export function aliasFile(id: string, title: string, target: string): CardFile {
  return file(id, { id, title, kind: 'alias', target }, '');
}

/**
 * Loaded cards, for the tests that deliberately build a broken graph and hand it
 * straight to `validateReferences` — `loadSpace` would reject these before they
 * ever reached it.
 */

export function card(id: string, title = id.toUpperCase(), body = ''): Card {
  return { id, title, kind: 'markdown', body };
}

export function alias(id: string, title: string, target: string): Card {
  return { id, title, kind: 'alias', target };
}
