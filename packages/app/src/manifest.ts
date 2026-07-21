import { parseManifest, type Manifest } from '@project/core';
import { validateReferences, type ReferenceError } from '@project/graph';
import graphJson from '../example/graph.json';

/**
 * Load and validate the bundled example presentation. The app is file-first and
 * read-only: everything below is derived from `graph.json` + the markdown files.
 */

const rawCards = import.meta.glob('../example/cards/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const manifest: Manifest = parseManifest(graphJson);

export const referenceErrors: ReferenceError[] = validateReferences(manifest);

export const markdownByCardId: Record<string, string> = Object.fromEntries(
  // Only markdown cards own a content file. An alias resolves through its target
  // at draw time (ADR 0009), so it contributes no entry of its own here.
  manifest.cards.flatMap((card) => {
    if (card.kind !== 'markdown') return [];
    const entry = Object.entries(rawCards).find(([path]) => path.endsWith(`/${card.content}`));
    return [[card.id, entry?.[1] ?? `*Missing content file: ${card.content}*`]];
  }),
);
