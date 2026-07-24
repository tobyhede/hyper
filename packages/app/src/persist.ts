import type { SpaceFile } from '@project/core';
import type { LayoutPoint } from '@project/graph';

/**
 * Turning a live arrangement back into a space file, and sending it to the dev
 * server to be saved (ticket 06).
 *
 * Serialize from the space *file*, never from the `Space`: the `Space` is indexed
 * and derived, so rebuilding a file from it would mean un-deriving (ADR 0010).
 * `space.ts` keeps the parsed file beside the Space precisely so this can spread
 * it.
 */

/**
 * The id and title given to a Layout the app created rather than an author (ADR
 * 0017). An entity has one id — a short, authored-style one — and this is the app
 * minting that id because no author was present to type it (ADR 0016, rejected).
 * Not `graph`: that would shadow the built-in view, spending the only name the
 * automatic view has, when this Layout wants its own.
 */
export const CREATED_LAYOUT_ID = 'layout';
export const CREATED_LAYOUT_TITLE = 'Layout';

/**
 * Fold the live positions into the space file as its active Layout, and make the
 * space open in it. Writing `defaultView` is the point: an arrangement that does
 * not reopen is the derived-placement failure wearing a different hat.
 *
 * An existing Layout of this id is replaced, not merged — the map the store holds
 * is the whole truth of where the cards are.
 */
export function serializeLayout(
  base: SpaceFile,
  layoutId: string,
  title: string,
  positions: ReadonlyMap<string, LayoutPoint>,
): SpaceFile {
  const layout = {
    id: layoutId,
    title,
    kind: 'positioned' as const,
    positions: Object.fromEntries([...positions].map(([id, p]) => [id, { x: p.x, y: p.y }])),
  };
  const others = (base.layouts ?? []).filter((l) => l.id !== layoutId);
  return { ...base, layouts: [...others, layout], defaultView: layoutId };
}

/**
 * PUT the space file to the dev-only `/__space` endpoint, which validates it and
 * writes the authored `space.json` **in place** — there is no local shadow copy
 * any more, so a save dirties the worktree and `git checkout` is the undo.
 *
 * Dev-only by the `import.meta.env.DEV` guard here and by the endpoint living in
 * the plugin's `configureServer`, a hook Vite calls only for the dev server. The
 * plugin itself is *not* `apply: 'serve'` — reading has to work in a build, since
 * `space.ts` imports the virtual module unconditionally.
 */
export async function saveSpaceFile(next: SpaceFile): Promise<void> {
  if (!import.meta.env.DEV) return;
  await fetch('/__space', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(next),
  });
}
