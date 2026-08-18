import { uuidSchema, type GraphEdge, type LayoutPosition, type SpaceSnapshot } from '@project/core';
import {
  loadSpace,
  loadSpaceSnapshot,
  newSpace,
  type LoadSpaceResult,
  type LoadSpaceSnapshotResult,
  type Space,
} from '@project/graph';

/**
 * The Spaces the catalogue's stories draw.
 *
 * ADR 0052 makes the stable stories production-parity evidence, so a fixture
 * that *transcribes* what production derives is the one thing they must not be:
 * the sidebar's Graph colours used to be hex literals copied out of
 * `GRAPH_PALETTE` under a comment promising they matched, which is parity held
 * by a comment. These go through the same intake production does — a story
 * cannot draw a Space the app would refuse — and everything derived is derived
 * here too.
 *
 * Both are loaded at module scope, so a literal that stops parsing takes the
 * story down with a message instead of rendering something subtly wrong.
 *
 * Each also **declares where it opens**, so `defaultRenderer` answers that for a
 * story exactly as it does for the app. The fixture used to decide it — "the
 * first Layout, else Flow" — which is the state translation ADR 0052's negative
 * names. `story-spaces.test.ts` holds the declaration and what the Ladle specs
 * press to the same answer.
 */

const loaded = (result: LoadSpaceResult | LoadSpaceSnapshotResult): Space => {
  if (!result.ok) throw new Error(`Story Space did not load: ${JSON.stringify(result.errors)}`);
  return result.space;
};

const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const CARD_D = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const CARD_E = uuidSchema.parse('00000000-0000-4000-8000-00000000000c');

/** Five Cards in a row. The sidebar draws none of them; the geometry only has to be legal. */
const SPINE = [CARD_A, CARD_B, CARD_C, CARD_D, CARD_E] as const;

const positions = (count: number): Record<string, LayoutPosition> =>
  Object.fromEntries(SPINE.slice(0, count).map((id, index) => [id, { x: index * 420, y: 0 }]));

/** The first `links` steps along the spine: three Graphs of one shape at three lengths. */
const chain = (links: number): GraphEdge[] =>
  SPINE.flatMap((from, index) => {
    const to = SPINE[index + 1];
    return index < links && to !== undefined ? [{ from, to }] : [];
  });

/** Named once, because the Space both declares this Layout and opens on it. */
const COLLECTION_ONE = uuidSchema.parse('00000000-0000-4000-8000-000000000020');

/**
 * A Space with two authored Layouts and the four Graphs they own.
 *
 * **No Graph carries a colour.** A Graph without one takes a palette slot by
 * order through `graphColorMap`, and the flatten across Layouts in declared
 * order (ADR 0045) puts Long, Mid, Short and Echo in the first four slots — the
 * same blue, amber, green and pink the fixture used to write out by hand.
 * Deriving them is the point: a palette edit reaches the story, and the story
 * cannot claim a colour production would not give it.
 *
 * **It names `defaultView`**, which the tracked e2e fixture deliberately does
 * not: that one exists to prove a Space declaring Layouts still arrives in Flow,
 * and this one exists to draw a sidebar with a Layout pressed. Declaring it is
 * how the story gets that from `defaultRenderer` instead of from a rule the
 * harness keeps.
 *
 * Exported alongside the {@link authoredSpace} it loads into, because a story
 * that opens a real `SpaceSession` needs the stored shape and not the validated
 * aggregate. One literal, two exports: the snapshot a session commits and the
 * Space the other stories draw cannot come to disagree.
 */
export const authoredSnapshot: SpaceSnapshot = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000040'),
  document: {
    version: 1,
    title: 'Workspace',
    defaultView: COLLECTION_ONE,
    layouts: [
      {
        id: COLLECTION_ONE,
        title: 'Collection 1',
        kind: 'positioned',
        positions: positions(5),
        graphs: [
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000030'),
            title: 'Long',
            edges: chain(4),
          },
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000031'),
            title: 'Mid',
            edges: chain(3),
          },
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000032'),
            title: 'Short',
            edges: chain(2),
          },
        ],
      },
      {
        id: uuidSchema.parse('00000000-0000-4000-8000-000000000021'),
        title: 'Collection 2',
        kind: 'positioned',
        positions: positions(2),
        graphs: [
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000033'),
            title: 'Echo',
            edges: chain(1),
          },
        ],
      },
    ],
  },
  cards: SPINE.map((id, index) => ({
    id,
    document: { title: `Card ${index + 1}`, kind: 'markdown', body: '' },
  })),
};

export const authoredSpace: Space = loaded(loadSpaceSnapshot(authoredSnapshot));

/**
 * {@link authoredSnapshot} one Edit later: a third Layout, `Collection 3`.
 *
 * What a story submits has to differ from what it loaded, or a failed save and
 * a successful one draw the same list and nothing proves the sidebar read the
 * session at all. The Layout only has to be legal — a title, positions naming
 * Cards this Space already holds, and one owned Graph whose Edge endpoints are
 * members of it (ADR 0040) — so it is built from the same spine helpers the two
 * Layouts above it are, rather than by transcribing coordinates a third time.
 *
 * It **appends**, and an Edit here that removed or replaced a Layout or a Graph
 * would not. The fixture that submits this seeds its opened canvas and its
 * Active Graph from the first Space it is handed and never reconciles them
 * against a later one, so withdrawing `Collection 1` would leave the story
 * naming a Layout the Space no longer holds.
 */
export const editedSnapshot: SpaceSnapshot = {
  ...authoredSnapshot,
  document: {
    ...authoredSnapshot.document,
    layouts: [
      ...(authoredSnapshot.document.layouts ?? []),
      {
        id: uuidSchema.parse('00000000-0000-4000-8000-000000000022'),
        title: 'Collection 3',
        kind: 'positioned',
        positions: positions(3),
        graphs: [
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000034'),
            title: 'Trail',
            edges: chain(2),
          },
        ],
      },
    ],
  },
};

/**
 * A Space before its first Edit: one Card, no Layout and so no Graph.
 *
 * `newSpace()` is the one encoding of ADR 0018, and a hand-written snapshot
 * beside it would be a second — the story would go on saying "one Card" long
 * after the rule said something else. It returns the **on-disk** shape, a space
 * file and its card files, which is why this is `loadSpace` rather than
 * `loadSpaceSnapshot`.
 *
 * It mints fresh ids on every page load, and nothing reads one: no story and no
 * Ladle spec names a Card, a Layout or a Graph of this Space.
 */
const minted = newSpace();
export const unauthoredSpace: Space = loaded(loadSpace(minted.file, minted.cardFiles));
