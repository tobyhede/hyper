import { loadSpace, type Space } from '@project/graph';
import spaceJson from '../example/space.json';

/**
 * Load the bundled example space. The app is file-first and read-only:
 * everything below is derived from `space.json` + the markdown files. The
 * bundled file is authored to be valid, so a failed load is a build-time bug —
 * we throw rather than render a half-space (ADR 0010).
 */

const result = loadSpace(spaceJson);
if (!result.ok) {
  throw new Error(
    `The bundled space failed to load:\n${result.errors.map((e) => `  - ${e.message}`).join('\n')}`,
  );
}

export const space: Space = result.space;

const rawCards = import.meta.glob('../example/cards/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const markdownByCardId: Record<string, string> = Object.fromEntries(
  // Only markdown cards own a content file. An alias resolves through its target
  // at draw time (ADR 0009), so it contributes no entry of its own here.
  space.cards.flatMap((card) => {
    if (card.kind !== 'markdown') return [];
    const entry = Object.entries(rawCards).find(([path]) => path.endsWith(`/${card.content}`));
    return [[card.id, entry?.[1] ?? `*Missing content file: ${card.content}*`]];
  }),
);
