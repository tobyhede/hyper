import {
  newUuid,
  uuidSchema,
  type CardPlacement,
  type CardId,
  type GraphEdge,
  type GraphId,
  type SpaceSnapshot,
  type UUID,
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
 * Each also **declares where it opens**, so `defaultLayout` answers that for a
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
const COLLECTION_TWO = uuidSchema.parse('00000000-0000-4000-8000-000000000021');

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
 * **It names `defaultLayout`**, which the tracked e2e fixture deliberately does
 * not: that one exists to prove a Space declaring Layouts still arrives in Flow,
 * and this one exists to draw a sidebar with a Layout pressed. Declaring it is
 * how the story gets that from `defaultLayout` instead of from a rule the
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
    defaultLayout: COLLECTION_ONE,
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
        id: COLLECTION_TWO,
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

/**
 * The same Space opened on Collection 2, which holds two of the five Cards.
 *
 * The Cards drawer's stories need a Layout some Cards are *absent* from, and
 * this **declares where it opens** like every other fixture here rather than
 * leaving a story to index into `layouts` — array order is not a declaration,
 * and a Layout inserted before it would move the story somewhere else in
 * silence. `story-spaces.test.ts` holds both halves: where it opens, and that
 * Cards remain outside it.
 */
export const sparseAuthoredSnapshot: SpaceSnapshot = {
  ...authoredSnapshot,
  document: { ...authoredSnapshot.document, defaultLayout: COLLECTION_TWO },
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
 * A newly created Space: one Card, placed in one authored Layout owning one
 * empty Active Graph (ADR 0018, ADR 0080).
 *
 * `newSpace()` is the one encoding of that starting state, and a hand-written
 * snapshot beside it would be a second — the story would go on saying "one Card
 * and no Layout" long after the rule said something else. It returns the
 * **on-disk** shape, a space file and its card files, which is why this is
 * `loadSpace` rather than `loadSpaceSnapshot`.
 *
 * It mints fresh ids on every page load, and nothing reads one: no story and no
 * Ladle spec names a Card, a Layout or a Graph of this Space by id, only the
 * `Layout 1` and `Graph 1` titles `newSpace()` mints for them. The ambient
 * generator is named here rather than inside `newSpace`, which takes its
 * identity source like every other minting operation (ADR 0016); this fixture
 * is the composition root that supplies it.
 */
const minted = newSpace(newUuid);
export const newSpaceFixture: Space = loaded(loadSpace(minted.file, minted.cardFiles));

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
 * Each **declares where it opens**, so `defaultLayout` and ADR 0026's Active
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

const TRAVERSAL_LAYOUT = uuidSchema.parse('00000000-0000-4000-8000-000000000060');
const TRAVERSAL_CARDS = [
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
export const traversalSnapshot: SpaceSnapshot = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000041'),
  document: {
    version: 1,
    title: 'Traversal',
    defaultLayout: TRAVERSAL_LAYOUT,
    layouts: [
      {
        id: TRAVERSAL_LAYOUT,
        title: 'Traversal',
        kind: 'positioned',
        positions: traversalPositions(TRAVERSAL_CARDS.map(([id]) => id)),
        graphs: [
          {
            id: uuidSchema.parse('00000000-0000-4000-8000-000000000061'),
            title: 'Traversal',
            edges: [
              { from: TRAVERSAL_CARDS[0][0], to: TRAVERSAL_CARDS[1][0] },
              { from: TRAVERSAL_CARDS[1][0], to: TRAVERSAL_CARDS[2][0] },
            ],
          },
        ],
      },
    ],
  },
  cards: traversalCards(TRAVERSAL_CARDS),
};

export const traversalSpace: Space = loaded(loadSpaceSnapshot(traversalSnapshot));

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
export const deepDiveSnapshot: SpaceSnapshot = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000042'),
  document: {
    version: 1,
    title: 'Deep dive',
    defaultLayout: DEEP_DIVE_LAYOUT,
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
};

export const deepDiveSpace: Space = loaded(loadSpaceSnapshot(deepDiveSnapshot));

/* -------------------------------------------------------------------------- */
/* Command Dock                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Where the Command Dock prototype's identities live: `0x80`..`0xbf`.
 *
 * A reserved block, like {@link MINTED_GRAPH_ID_BASE} and for the same reason.
 * Thirty-four Cards, Layouts and Graphs written out as full literals would bury
 * the shape of the fixture in uuids, so they are minted from this base instead
 * — and the base is declared here, above everything that draws from it, so the
 * block a reader has to keep clear is visible in one place.
 */
const DOCK_ID_BASE = 0x80;

const dockId = (offset: number): UUID =>
  uuidSchema.parse(
    `00000000-0000-4000-8000-${(DOCK_ID_BASE + offset).toString(16).padStart(12, '0')}`,
  );

const DOCK_COLLECTION_ONE = dockId(0);
const DOCK_COLLECTION_TWO = dockId(1);

/**
 * The Cards `Collection 1` places, and all three kinds among them.
 *
 * The kinds are the point rather than decoration: the Dock's Cards list draws
 * `CardKindIcon` on every row and the canvas draws the production `CardNode`,
 * so a fixture of five markdown Cards would let a list and a canvas disagree
 * about what a Space Card looks like without either being wrong.
 *
 * The second title is the long one, carried over from the inventory fixture for
 * the same reason it exists there: three lines at 18px in a 260px Card is what
 * the balance and the clamp are there to survive, and a Dock that occludes a
 * Card is judged against a Card that is actually full.
 */
const DOCK_PLACED = [
  { id: dockId(0x10), title: 'Opening', kind: 'markdown' },
  {
    id: dockId(0x11),
    title: 'Why authored placement beats a layout engine that reshuffles on every edit',
    kind: 'markdown',
  },
  { id: dockId(0x12), title: 'Strategies', kind: 'markdown' },
  { id: dockId(0x13), title: 'Design system', kind: 'space' },
  { id: dockId(0x14), title: 'Strategy overview', kind: 'alias' },
] as const;

/**
 * The Cards `Collection 1` does *not* place — what the Dock's Cards surface offers.
 *
 * **Twenty-nine rather than four, and that count is the fixture's whole claim.**
 * A list of four fits any surface and settles nothing, while a real Space's
 * unplaced Cards outnumber its Layouts and Graphs by an order of magnitude. The
 * open question the Dock's list surfaces are compared on — an edge drawer, an
 * anchored popover, a second dock — is whether each can carry that many rows
 * and still be dragged out of, so a fixture that cannot overrun a popover
 * cannot be evidence either way.
 *
 * The Space Cards among them are not a separate fixture. They are what the
 * Dock's Spaces list draws, which is the whole of the claim that a Space is a
 * Card and needs no construct of its own.
 */
const DOCK_UNPLACED = [
  { title: 'Constraints', kind: 'markdown' },
  { title: 'Prior art', kind: 'markdown' },
  { title: 'Persistence', kind: 'space' },
  { title: 'Revision history', kind: 'markdown' },
  { title: 'Optimistic commit', kind: 'markdown' },
  { title: 'Conflict states', kind: 'markdown' },
  { title: 'Retry policy', kind: 'markdown' },
  { title: 'Handle geometry', kind: 'markdown' },
  { title: 'Camera', kind: 'markdown' },
  { title: 'Edge authoring', kind: 'space' },
  { title: 'Traversal', kind: 'markdown' },
  { title: 'Entry points', kind: 'markdown' },
  { title: 'Unreachable Cards', kind: 'markdown' },
  { title: 'Fork ranking', kind: 'markdown' },
  { title: 'Vocabulary', kind: 'markdown' },
  { title: 'Add vs Create', kind: 'markdown' },
  { title: 'Layout strategies', kind: 'space' },
  { title: 'Grid', kind: 'markdown' },
  { title: 'Cluster', kind: 'markdown' },
  { title: 'Tree', kind: 'markdown' },
  { title: 'Sorts', kind: 'markdown' },
  { title: 'Open size', kind: 'markdown' },
  { title: 'Magnetic close', kind: 'markdown' },
  { title: 'Rendering', kind: 'space' },
  { title: 'HTTP boundary', kind: 'space' },
  { title: 'Tooling', kind: 'space' },
  { title: 'Camera overview', kind: 'alias' },
  { title: 'Grid overview', kind: 'alias' },
  { title: 'Traversal overview', kind: 'alias' },
] as const;

/** Every Card in the fixture, placed and unplaced, keyed by the title an alias names. */
const DOCK_CARD_IDS: ReadonlyMap<string, UUID> = new Map([
  ...DOCK_PLACED.map((card): [string, UUID] => [card.title, card.id]),
  ...DOCK_UNPLACED.map((card, index): [string, UUID] => [card.title, dockId(0x20 + index)]),
]);

const dockCardId = (title: string): UUID => {
  const id = DOCK_CARD_IDS.get(title);
  if (id === undefined) throw new Error(`Command Dock fixture has no Card titled ${title}`);
  return id;
};

/**
 * The Spaces a Space Card here points at: the other tracked fixtures, in turn.
 *
 * Real ids rather than minted ones, because a Space Card's whole content is the
 * Space it names — a fixture pointing at nothing would draw a Space Card that
 * could never resolve, and the Dock's Spaces list is exactly the surface that
 * would have to pretend otherwise.
 */
const DOCK_TARGET_SPACES = [authoredSnapshot.id, traversalSpace.id, deepDiveSpace.id] as const;

const dockTargetSpace = (index: number): UUID =>
  DOCK_TARGET_SPACES[index % DOCK_TARGET_SPACES.length] ?? authoredSnapshot.id;

/**
 * Which Card each Alias shows, named rather than derived from its title.
 *
 * A rule that stripped a suffix would make the Target a fact about spelling —
 * `Strategy overview` would have to point at `Strategys` — and an Alias whose
 * Target moves when someone rewords a title is not what ADR 0070 makes
 * immutable.
 */
const DOCK_ALIAS_TARGETS = new Map([
  ['Strategy overview', 'Strategies'],
  ['Camera overview', 'Camera'],
  ['Grid overview', 'Grid'],
  ['Traversal overview', 'Traversal'],
]);

const dockAliasTarget = (title: string): UUID => {
  const target = DOCK_ALIAS_TARGETS.get(title);
  if (target === undefined) throw new Error(`Command Dock fixture Alias ${title} names no Target`);
  return dockCardId(target);
};

type DockCardKind = 'markdown' | 'space' | 'alias';

const dockCardDocument = (
  title: string,
  kind: DockCardKind,
  index: number,
): SpaceSnapshot['cards'][number]['document'] => {
  if (kind === 'space') return { title, kind, spaceId: dockTargetSpace(index) };
  if (kind === 'alias') return { title, kind, target: dockAliasTarget(title) };
  return { title, kind, body: '' };
};

const DOCK_CARDS: SpaceSnapshot['cards'] = [
  ...DOCK_PLACED.map((card, index) => ({
    id: card.id,
    document: dockCardDocument(card.title, card.kind, index),
  })),
  ...DOCK_UNPLACED.map((card, index) => ({
    id: dockCardId(card.title),
    document: dockCardDocument(card.title, card.kind, index),
  })),
];

/** The first `links` steps along the placed Cards: Graphs of one shape at three lengths. */
const dockChain = (links: number): GraphEdge[] =>
  DOCK_PLACED.flatMap((card, index) => {
    const to = DOCK_PLACED[index + 1];
    return index < links && to !== undefined ? [{ from: card.id, to: to.id }] : [];
  });

const dockPositions = (count: number): Record<string, CardPlacement> =>
  Object.fromEntries(
    DOCK_PLACED.slice(0, count).map((card, index) => [
      card.id,
      { x: index * 420, y: 0, open: false },
    ]),
  );

/**
 * The Space the Command Dock prototype draws.
 *
 * Purpose-built, and deliberately not {@link authoredSpace}: that one exists to
 * draw a sidebar and every Card in it is placed, so a Cards surface opened over
 * it would have nothing to offer. The Dock needs three things at once that no
 * existing fixture has together — **two Layouts** to switch between, **three
 * Graphs over one Layout** so emphasis is a visible answer rather than a
 * one-member choice, and **many more unplaced Cards than placed ones**, which
 * is what its list surfaces are being compared on.
 *
 * **No Graph carries a colour**, exactly as `authoredSnapshot` does not: a Graph
 * without one takes a palette slot by order through `graphColorMap`. The
 * prototype this replaced wrote `#4c8dff`, `#d08a3a` and `#2f9e8f` out by hand,
 * which is a fixture free to disagree with the palette the canvas draws.
 *
 * It **declares where it opens**, so `defaultLayout` answers that for the Dock
 * exactly as it does for the app.
 */
export const commandDockSnapshot: SpaceSnapshot = {
  id: uuidSchema.parse('00000000-0000-4000-8000-000000000043'),
  document: {
    version: 1,
    title: 'Rendering',
    defaultLayout: DOCK_COLLECTION_ONE,
    layouts: [
      {
        id: DOCK_COLLECTION_ONE,
        title: 'Collection 1',
        kind: 'positioned',
        positions: dockPositions(5),
        graphs: [
          { id: dockId(2), title: 'Long', edges: dockChain(4) },
          { id: dockId(3), title: 'Mid', edges: dockChain(3) },
          { id: dockId(4), title: 'Short', edges: dockChain(2) },
        ],
      },
      {
        id: DOCK_COLLECTION_TWO,
        title: 'Collection 2',
        kind: 'positioned',
        positions: dockPositions(2),
        graphs: [{ id: dockId(5), title: 'Echo', edges: dockChain(1) }],
      },
    ],
  },
  cards: DOCK_CARDS,
};

export const commandDockSpace: Space = loaded(loadSpaceSnapshot(commandDockSnapshot));

/* -------------------------------------------------------------------------- */
/* Crossing chain                                                              */
/* -------------------------------------------------------------------------- */

/** Where the crossing chain's identities live: `0xd0`..`0xef`. */
const CHAIN_ID_BASE = 0xd0;

const chainId = (offset: number): UUID =>
  uuidSchema.parse(
    `00000000-0000-4000-8000-${(CHAIN_ID_BASE + offset).toString(16).padStart(12, '0')}`,
  );

/**
 * A Space whose Cards are all Space Cards: one link in a chain of crossings.
 *
 * **Depth is what these exist for.** Meta held every other fixture directly, so
 * the deepest trail a reader could walk was two — Meta and the Space they
 * entered — and a trail two deep cannot show what a Dock does with a trail that
 * outgrows it. Two links between Meta and the Dock's own Space make the walk
 * `Meta ▸ Platform ▸ Design system ▸ Rendering`, which is the shape the
 * collapsed form is judged on.
 *
 * They are ordinary Spaces and the crossing into them is the ordinary one: a
 * Space Card names a target, and the target is a tracked fixture that loads.
 * Seeding a session with a path no Space Card supports would draw a trail the
 * prototype could not have been walked into.
 *
 * Each takes a **block of sixteen** off {@link CHAIN_ID_BASE} — the Space, its
 * Layout, its Graph, then one Card per target — so a link that gains a target
 * cannot reach into the next link's ids.
 */
const crossingSpace = (
  block: number,
  title: string,
  targets: readonly (readonly [string, UUID])[],
): SpaceSnapshot => ({
  id: chainId(block),
  document: {
    version: 1,
    title,
    defaultLayout: chainId(block + 1),
    layouts: [
      {
        id: chainId(block + 1),
        title: 'Catalogue',
        kind: 'positioned',
        positions: Object.fromEntries(
          targets.map((_, index): [string, CardPlacement] => [
            chainId(block + 3 + index),
            { x: (index % 2) * 420, y: Math.floor(index / 2) * 320, open: false },
          ]),
        ),
        graphs: [{ id: chainId(block + 2), title: 'Catalogue', edges: [] }],
      },
    ],
  },
  cards: targets.map(([cardTitle, spaceId], index) => ({
    id: chainId(block + 3 + index),
    document: { title: cardTitle, kind: 'space', spaceId },
  })),
});

/** The link above the Dock's own Space, and the one the Dock's trail names. */
export const designSystemSnapshot: SpaceSnapshot = crossingSpace(0x00, 'Design system', [
  ['Rendering', commandDockSnapshot.id],
  ['Space', authoredSnapshot.id],
  ['Traversal', traversalSnapshot.id],
]);

/** The link below Meta, which a deep trail collapses. */
export const platformSnapshot: SpaceSnapshot = crossingSpace(0x10, 'Platform', [
  ['Design system', designSystemSnapshot.id],
  ['Deep dive', deepDiveSnapshot.id],
]);

export const designSystemSpace: Space = loaded(loadSpaceSnapshot(designSystemSnapshot));
export const platformSpace: Space = loaded(loadSpaceSnapshot(platformSnapshot));

/* -------------------------------------------------------------------------- */
/* Meta Space                                                                  */
/* -------------------------------------------------------------------------- */

/** Where the Meta Space fixture's identities live: `0xc0`..`0xcf`. */
const META_ID_BASE = 0xc0;

const metaId = (offset: number): UUID =>
  uuidSchema.parse(
    `00000000-0000-4000-8000-${(META_ID_BASE + offset).toString(16).padStart(12, '0')}`,
  );

/**
 * Every Space there is, as the Space Cards that reference them (ADR 0074).
 *
 * A Card's title is its own and the Space it points at has its own name, so
 * one of these deliberately disagrees: `Design system` in the Command Dock
 * fixture targets the Space titled `Space`. That is not a fixture error — it is
 * the question a crossing trail has to answer, since the row you pressed and
 * the Space you arrive in are named by two different authors.
 */
const META_TARGETS = [
  ['Platform', platformSnapshot.id],
  ['Rendering', commandDockSnapshot.id],
  ['Space', authoredSnapshot.id],
  ['Traversal', traversalSnapshot.id],
  ['Deep dive', deepDiveSnapshot.id],
] as const satisfies readonly (readonly [string, UUID])[];

const META_LAYOUT = metaId(0);

/**
 * The permanent Meta Space, which every other Space traces up to (ADR 0074).
 *
 * It exists here so the Command Dock prototype has a **root to exit to**. Meta
 * is where navigation starts and the one Space no reference reaches, so it is
 * the one crumb a crossing trail can never pop — and a prototype whose trail
 * bottoms out in whichever Space the story happened to open cannot show that.
 *
 * Its Cards are all Space Cards, which is the whole of CONTEXT's claim that at
 * the top level "every Space there is" needs no construct of its own: the list
 * a Space offers is the Space Cards in it, and up here that list is the
 * catalogue.
 */
export const metaSnapshot: SpaceSnapshot = {
  id: uuidSchema.parse('00000000-0000-4000-8000-0000000000c0'),
  document: {
    version: 1,
    title: 'Meta Space',
    defaultLayout: META_LAYOUT,
    layouts: [
      {
        id: META_LAYOUT,
        title: 'Catalogue',
        kind: 'positioned',
        positions: Object.fromEntries(
          META_TARGETS.map((_, index): [string, CardPlacement] => [
            metaId(0x8 + index),
            { x: (index % 2) * 420, y: Math.floor(index / 2) * 320, open: false },
          ]),
        ),
        graphs: [{ id: metaId(1), title: 'Catalogue', edges: [] }],
      },
    ],
  },
  cards: META_TARGETS.map(([title, spaceId], index) => ({
    id: metaId(0x8 + index),
    document: { title, kind: 'space', spaceId },
  })),
};

export const metaSpace: Space = loaded(loadSpaceSnapshot(metaSnapshot));
