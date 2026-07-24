import { spaceFileSchema, type SpaceFile } from '@project/core';
import { loadSpace, type Space } from '@project/graph';
import { cardFiles, spaceFile as spaceFileInput } from 'virtual:space-file';

/**
 * Load the space the dev server chose to serve — its space file and its card
 * files, because a card is a file and the space file holds only structure (ADR
 * 0020). The `virtual:space-file` module reads `fixture/space.local.json` when it
 * exists and falls back to `fixture/space.json` (see `vite-space-file-plugin.ts`),
 * so an arrangement saved on the last drag is what opens on the next full page
 * load.
 *
 * The base is the abstract test bed (`fixture/`), not the narrative demo
 * (`example/`, kept for when real space-loading exists) — it is deliberately the
 * one space `pnpm dev` serves and the one Playwright drives, so tests assert
 * behaviour against a purpose-shaped graph rather than demo prose. The file is
 * authored to be valid, so a failed load is a build-time bug — we throw rather
 * than render a half-space (ADR 0010).
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
