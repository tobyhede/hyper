import { spaceFileSchema, type SpaceFile } from '@project/core';
import { cardFileId, loadSpace, type Space } from '@project/graph';
import { cardFiles, spaceFile as spaceFileInput } from 'virtual:space-file';

/**
 * Load the space the dev server chose to serve — its space file and its card
 * files, because a card is a file and the space file holds only structure (ADR
 * 0020). The `virtual:space-file` module reads the authored space directory (see
 * `vite-space-file-plugin.ts`), which is also what a save writes back to — so an
 * arrangement saved on the last drag is what opens on the next full page load,
 * and throwing one away is `git checkout` rather than deleting a shadow file.
 *
 * Which space that is turns on `SPACE_DIR`: `pnpm dev` sets it to the abstract
 * test bed (`fixture/`), not the narrative demo (`example/`, kept for when real
 * space-loading exists), so tests assert behaviour against a purpose-shaped
 * graph rather than demo prose. With no `SPACE_DIR` the module hands back a
 * space the app minted — one card, no routes (ADR 0018) — which is what the app
 * does with nothing to open. Either way the value is authored to be valid or
 * built to be, so a failed load is a bug rather than a state to render: we throw
 * rather than show a half-space (ADR 0010).
 */

const result = loadSpace(spaceFileInput, cardFiles);
if (!result.ok) {
  throw new Error(
    `The bundled space failed to load:\n${result.errors.map((e) => `  - ${e.message}`).join('\n')}`,
  );
}

export const space: Space = result.space;

/**
 * The parsed space *file*, kept beside the `Space` it produced. A writer emits
 * this shape, not the `Space` — the `Space` is indexed and derived, so rebuilding
 * a file from it would mean un-deriving (ADR 0010). `loadSpace` already proved
 * the input parses, so this second parse cannot fail; it is how we recover the
 * typed file value without threading it out of `loadSpace`.
 */
export const spaceFile: SpaceFile = spaceFileSchema.parse(spaceFileInput);

/**
 * Each card's file exactly as it was read, keyed by the card's id.
 *
 * A save sends every card, and what it sends for a card nobody edited has to be
 * the bytes that are already there — not a reconstruction of them. Rebuilding a
 * card from its parse is lossy in ways that look like nothing and are not: a
 * frontmatter comment is gone, a `kind` the author left to the default is
 * written out, quoting and key order are normalised. The server writes only what
 * differs, so every one of those turns a save that moved a card into a rewrite
 * of every hand-authored card file in the space.
 *
 * Keyed with the same reader intake used, so the id here is the id the `Space`
 * knows the card by. When a card's *content* becomes editable, an edited card is
 * the one that gets serialized and the rest keep coming from here.
 */
export const cardSource: ReadonlyMap<string, string> = new Map(
  cardFiles.flatMap((file) => {
    const id = cardFileId(file.text);
    return id === undefined ? [] : [[id, file.text] as const];
  }),
);
