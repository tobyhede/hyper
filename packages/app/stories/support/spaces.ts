import {
  uuidSchema,
  type CardPlacement,
  type CardId,
  type GraphEdge,
  type GraphId,
  type SpaceSnapshot,
} from '@project/core';
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

const positions = (count: number): Record<string, CardPlacement> =>
  Object.fromEntries(
    SPINE.slice(0, count).map((id, index) => [id, { x: index * 420, y: 0, open: false }]),
  );

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
 * **It names `defaultRenderer`**, which the tracked e2e fixture deliberately does
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
    title: 'Space',
    defaultRenderer: COLLECTION_ONE,
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

/**
 * Where a story's converted Graph takes its identity.
 *
 * Here rather than in the fixture, because the only thing that decides whether
 * a minted id is safe is the block of ids declared above it, and the two were
 * in different files: the fixture counted from one and handed out the very ids
 * `CARD_A` and `CARD_B` already carry. `convertSubject` would not have refused
 * either — a conversion's freshness is checked against the Space's *Graphs*
 * (ADR 0045), and a Card's id is not one — so a story that converted a View
 * would have minted a Graph wearing a Card's identity, in silence.
 *
 * No story converts one today. The counter is the fixture's answer to ADR
 * 0016's composition seam, and nothing presses it; the collision is one Ladle
 * spec away rather than on screen now. Co-locating it is what stops that being
 * a thing to remember: an id declared above and the counter below it are read
 * together, and `story-spaces.test.ts` holds them apart.
 *
 * The base is a **reserved block** rather than one past the highest id, so a
 * story that declares another Card or Layout does not have to move it — the
 * literals above occupy `0x02`..`0x40`, and this leaves the whole space between
 * them and here. Hexadecimal throughout, which is what the ids are: the
 * decimal counter this replaced rendered `12` as `…0000012` while `CARD_E` is
 * `…000000c`, so the two spellings did not even sort against each other.
 */
export const MINTED_GRAPH_ID_BASE = 0x1000;

export const storyGraphIds = (): (() => GraphId) => {
  let next = MINTED_GRAPH_ID_BASE;
  return () => {
    next += 1;
    return uuidSchema.parse(`00000000-0000-4000-8000-${next.toString(16).padStart(12, '0')}`);
  };
};

/* -------------------------------------------------------------------------- */
/* Traversal                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The Spaces the presenting stories traverse.
 *
 * Purpose-built, and deliberately not the sidebar's `authoredSpace`: that one
 * exists to draw four Graphs in a list and every one of them is a line, so it
 * can show a one-member choice and nothing else. A fork needs a Card with
 * several outgoing Edges, and there is no such Card anywhere in the tracked
 * fixtures — the E2E fixture's Graphs are deliberately all lines too.
 *
 * Each **declares where it opens**, so `defaultRenderer` and ADR 0026's Active
 * Graph rule answer for a story exactly as they do for the app: the Layout named
 * here owns one Graph, and a Layout that names no `activeGraph` opens on the
 * first it owns. A story therefore calls `present()` and nothing else to be
 * presenting the Graph it is about.
 *
 * The titles are a talk's, not `Card N`: what the chrome draws is a choice
 * between destinations, and the design pass this catalogue exists for cannot
 * judge a row of choices whose labels are all the same length.
 */
const traversalPositions = (ids: readonly CardId[]): Record<string, CardPlacement> =>
  Object.fromEntries(ids.map((id, index) => [id, { x: index * 420, y: 0, open: false }]));

const traversalCards = (titled: readonly (readonly [CardId, string])[]): SpaceSnapshot['cards'] =>
  titled.map(([id, title]) => ({ id, document: { title, kind: 'markdown', body: '' } }));

const WALKTHROUGH_LAYOUT = uuidSchema.parse('00000000-0000-4000-8000-000000000060');
const WALKTHROUGH_CARDS = [
  [uuidSchema.parse('00000000-0000-4000-8000-000000000062'), 'Introduction'],
  [uuidSchema.parse('00000000-0000-4000-8000-000000000063'), 'How it works'],
  [uuidSchema.parse('00000000-0000-4000-8000-000000000064'), 'Wrap up'],
] as const satisfies readonly (readonly [CardId, string])[];

/**
 * A line: one move at each Card, and a sink two moves in.
 *
 * The degenerate fork rather than a second mode (ADR 0024) — which is exactly
 * what the one-move story has to show, and what a sink reached by advancing
 * twice through it has to end.
 */
export const walkthroughSpace: Space = loaded(
  loadSpaceSnapshot({
    id: uuidSchema.parse('00000000-0000-4000-8000-000000000041'),
    document: {
      version: 1,
      title: 'Walkthrough',
      defaultRenderer: WALKTHROUGH_LAYOUT,
      layouts: [
        {
          id: WALKTHROUGH_LAYOUT,
          title: 'Walkthrough',
          kind: 'positioned',
          positions: traversalPositions(WALKTHROUGH_CARDS.map(([id]) => id)),
          graphs: [
            {
              id: uuidSchema.parse('00000000-0000-4000-8000-000000000061'),
              title: 'Walkthrough',
              edges: [
                { from: WALKTHROUGH_CARDS[0][0], to: WALKTHROUGH_CARDS[1][0] },
                { from: WALKTHROUGH_CARDS[1][0], to: WALKTHROUGH_CARDS[2][0] },
              ],
            },
          ],
        },
      ],
    },
    cards: traversalCards(WALKTHROUGH_CARDS),
  }),
);

const DEEP_DIVE_LAYOUT = uuidSchema.parse('00000000-0000-4000-8000-000000000070');
const DEEP_DIVE_CARDS = [
  [uuidSchema.parse('00000000-0000-4000-8000-000000000072'), 'Introduction'],
  [uuidSchema.parse('00000000-0000-4000-8000-000000000073'), 'Read path'],
  [uuidSchema.parse('00000000-0000-4000-8000-000000000074'), 'Write path'],
  [uuidSchema.parse('00000000-0000-4000-8000-000000000075'), 'Failure modes'],
  [
    uuidSchema.parse('00000000-0000-4000-8000-000000000076'),
    'Operating notes, rollback and the on-call runbook',
  ],
] as const satisfies readonly (readonly [CardId, string])[];

/**
 * A fork: four Edges out of the Card a traversal begins at, each to a sink.
 *
 * Four rather than two, and one title deliberately longer than the bounded
 * button can hold, because the row this chrome renders has to be judged on a
 * choice set that can genuinely outrun it — a Graph's out-degree has no upper
 * bound and a Card's title no length limit, so a design that only ever sees two
 * short choices never shows what it does with either.
 */
export const deepDiveSpace: Space = loaded(
  loadSpaceSnapshot({
    id: uuidSchema.parse('00000000-0000-4000-8000-000000000042'),
    document: {
      version: 1,
      title: 'Deep dive',
      defaultRenderer: DEEP_DIVE_LAYOUT,
      layouts: [
        {
          id: DEEP_DIVE_LAYOUT,
          title: 'Deep dive',
          kind: 'positioned',
          positions: traversalPositions(DEEP_DIVE_CARDS.map(([id]) => id)),
          graphs: [
            {
              id: uuidSchema.parse('00000000-0000-4000-8000-000000000071'),
              title: 'Deep dive',
              edges: DEEP_DIVE_CARDS.slice(1).map(([id]) => ({
                from: DEEP_DIVE_CARDS[0][0],
                to: id,
              })),
            },
          ],
        },
      ],
    },
    cards: traversalCards(DEEP_DIVE_CARDS),
  }),
);
