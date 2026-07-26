import type { Card, SpaceFile } from '@project/core';
import { serializeCardFile, type LayoutPoint } from '@project/graph';

/**
 * Turning a live arrangement back into a space file, and sending it to the dev
 * server to be saved — when the author asks, never as a consequence of an edit
 * (ADR 0029).
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
 * is the whole truth of where the cards are. That holds for the *positions*, and
 * for the active route, and for nothing else: the route filter is authored, the
 * app has no surface for writing one, so it is carried through untouched rather
 * than deleted by a save that never knew about it.
 */
export function serializeLayout(
  base: SpaceFile,
  layoutId: string,
  title: string,
  positions: ReadonlyMap<string, LayoutPoint>,
  activeRouteId: string | null,
): SpaceFile {
  const existing = (base.layouts ?? []).find((l) => l.id === layoutId);
  const layout = {
    id: layoutId,
    title,
    kind: 'positioned' as const,
    positions: Object.fromEntries([...positions].map(([id, p]) => [id, { x: p.x, y: p.y }])),
    ...(existing?.routes ? { routes: existing.routes } : {}),
    // ADR 0028: resolving an absent `activeRoute` to the first visible route is a
    // read, never a write. A file the app wrote names the active route outright,
    // so reopening it does not depend on the order the routes happen to sit in —
    // and a route minted by editing is recorded as active by the same rule.
    ...(activeRouteId !== null ? { activeRoute: activeRouteId } : {}),
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
 *
 * Reports whether it wrote (ADR 0029). The caller marks the space saved on that
 * answer and on nothing else, so a refusal leaves the space unsaved, which is
 * what it is — and the Save control stays lit, which is the author's report.
 * There are more ways to be refused than there look: the endpoint answers 400
 * (invalid payload, or an id it cannot write), 403 (cross-origin), 413 (too
 * large), 500 (the disk) and 501 (nowhere to write, ADR 0018), and a build has
 * no endpoint at all.
 */
export async function saveSpace(spaceFile: SpaceFile, cards: readonly Card[]): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  const response = await fetch('/__space', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    // Cards go as id and text, never as a path. The server derives every path
    // from the id, which is what keeps the endpoint from being an
    // arbitrary-file-write primitive. `serializeCardFile` is the same function
    // `parseCardFile` inverts, so what is written is what will load.
    body: JSON.stringify({
      spaceFile,
      cards: cards.map((card) => ({ id: card.id, text: serializeCardFile(card) })),
    }),
  });

  // `fetch` resolves for 400 and 500 alike, so the status is the only thing that
  // says whether this wrote. Reading it is what makes the unsaved indicator
  // honest: without it a rejection looks exactly like a save, the Save control
  // goes dark, and the arrangement vanishes on the next reload with nothing
  // having said so.
  //
  // A read-only server is the one case this reads as saved when nothing reached
  // disk — it answers 204 having done nothing, deliberately, so an e2e drag
  // cannot edit the fixture the suite asserts against. `read-only.spec.ts` is
  // where that is pinned, by the header rather than the status.
  return response.ok;
}
