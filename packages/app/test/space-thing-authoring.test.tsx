import { act, fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  newUuid,
  spaceSnapshotSchema,
  uuidSchema,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import {
  MemorySpaceBackend,
  MemorySpaceBackendTestControl,
  type ObserverErrorReporter,
  type SpaceSession,
} from '@project/persistence';
import { mountSpace } from './space-mounting';
import { composeApp } from '../src/compose-app';
import { mintingIds } from './minting';
import { openTestSpace } from './opened-space';
import type { SpaceThingAuthoring } from '../src/space-thing-lifecycle';
import { createThing, unavailable } from './command-dock';

/**
 * Creating a Space Thing, from the control an author actually has.
 *
 * The coordinated Edit underneath is proven at the lifecycle interface
 * (`space-thing-lifecycle.test.ts`) — atomicity, the reference cascade, every
 * persistence recovery — and nothing here re-derives any of it. What these
 * tests are about is the half that only exists once there is a surface: that
 * the menu reaches the pane, that one typed title seeds three things and then
 * lets go of them, that referencing an existing Space adds a reference and
 * never a copy, and that a refusal keeps the field that could answer it.
 *
 * Every assertion about what was created is made against the backend and the
 * session rather than the canvas: a Space Thing creates a *second* Space, and
 * the containing Space's canvas is exactly the place that cannot show it.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_TO_OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const HOME_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const HOME_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const HOME_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const HOME_NEXT_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');

const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const OTHER_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const OTHER_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
/**
 * `Collection 1` owns two Graphs and has authored the second as its Active one.
 *
 * The asymmetry is the fixture's job: a selection seeded from the head of the
 * list and one seeded from the Diagram's own Active Graph agree everywhere a
 * Diagram owns one Graph, so only a Diagram like this can say which rule ran
 * (ADR 0026).
 */
const OTHER_DRAFT_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const OTHER_SECOND_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const OTHER_SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000027');

/**
 * The three identities a reference to a diagramless Space mints, in order.
 *
 * The Diagram and the Graph go first because initialization runs before the
 * Thing is authored at all (ADR 0079) — a target that could not be prepared
 * produces no Thing — and the Thing's own id is drawn last.
 */
const MINTED_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000030');
const MINTED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
const MINTED_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000032');

/**
 * The Meta Space over the ordinary Spaces below it.
 *
 * It is here because the aggregate demands it rather than because these tests
 * are about it: Meta is the sole root and every ordinary Space must be
 * referenced (ADR 0074), so a candidate that left `Home` unreachable would be
 * refused for a reason none of these tests is making.
 *
 * What Meta cannot do is reference a Space with no Diagram. A Space Thing names
 * a Diagram of its target (ADR 0079) and a diagramless target offers none to
 * name, so `Other` goes unreferenced for exactly as long as it stays that way —
 * and the Edit under test is the one that initializes it *and* references it,
 * which is the only moment the whole aggregate is read.
 */
const meta = (target: SpaceSnapshot): SpaceSnapshot => {
  const toOther =
    target.document.defaultDiagram === undefined
      ? []
      : [
          {
            id: META_TO_OTHER_ID,
            document: {
              title: 'Other',
              kind: 'space',
              spaceId: OTHER_ID,
              diagram: OTHER_DIAGRAM_ID,
              graph: OTHER_GRAPH_ID,
            },
          },
        ];
  const things = [
    { id: META_THING_ID, document: { title: 'Meta', kind: 'markdown', body: '' } },
    {
      id: META_TO_HOME_ID,
      document: {
        title: 'Home',
        kind: 'space',
        spaceId: HOME_ID,
        diagram: HOME_DIAGRAM_ID,
        graph: HOME_GRAPH_ID,
      },
    },
    ...toOther,
  ];
  return spaceSnapshotSchema.parse({
    id: META_ID,
    document: {
      version: 1,
      title: 'Meta',
      diagrams: [
        {
          id: META_DIAGRAM_ID,
          title: 'Diagram 1',
          kind: 'positioned',
          positions: Object.fromEntries(
            things.map((thing, index) => [thing.id, { x: index * 300, y: 0, open: false }]),
          ),
          graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
        },
      ],
      defaultDiagram: META_DIAGRAM_ID,
    },
    things,
  });
};

/** The Space the app opens, and the one every Space Thing below is created in. */
const home: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: HOME_ID,
  document: {
    version: 1,
    title: 'Home',
    diagrams: [
      {
        id: HOME_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [HOME_THING_ID]: { x: 10, y: 20, open: false },
          [HOME_NEXT_THING_ID]: { x: 310, y: 20, open: false },
        },
        // An Edge, so this Space can be presented: presenting is one of the
        // things that closes the creation pane, and a Graph with no Edge
        // declines to start (ADR 0032).
        graphs: [
          {
            id: HOME_GRAPH_ID,
            title: 'Graph 1',
            edges: [{ from: HOME_THING_ID, to: HOME_NEXT_THING_ID }],
          },
        ],
      },
    ],
    defaultDiagram: HOME_DIAGRAM_ID,
  },
  things: [
    { id: HOME_THING_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
    { id: HOME_NEXT_THING_ID, document: { title: 'And then', kind: 'markdown', body: '' } },
  ],
});

/**
 * The Space an author references instead of creating one: already initialized,
 * with two Diagrams to tell one Space Thing's selection from another's.
 */
const other: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: OTHER_ID,
  document: {
    version: 1,
    title: 'Other Space',
    diagrams: [
      {
        id: OTHER_DIAGRAM_ID,
        title: 'Collection 1',
        kind: 'positioned',
        positions: { [OTHER_THING_ID]: { x: 0, y: 0, open: false } },
        graphs: [
          { id: OTHER_DRAFT_GRAPH_ID, title: 'Draft', edges: [] },
          { id: OTHER_GRAPH_ID, title: 'Current', edges: [] },
        ],
        activeGraph: OTHER_GRAPH_ID,
      },
      {
        id: OTHER_SECOND_DIAGRAM_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: OTHER_SECOND_GRAPH_ID, title: 'Second pass', edges: [] }],
      },
    ],
    defaultDiagram: OTHER_DIAGRAM_ID,
  },
  things: [{ id: OTHER_THING_ID, document: { title: 'Thing 1', kind: 'markdown', body: '' } }],
});

/**
 * The same Space as it is stored before anything has opened it: no Diagram at
 * all, which is the state ADR 0079's first working load exists to end.
 */
const diagramlessOther: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: OTHER_ID,
  document: { version: 1, title: 'Other Space' },
  things: [{ id: OTHER_THING_ID, document: { title: 'Thing 1', kind: 'markdown', body: '' } }],
});

/**
 * The same `Other Space`, already referencing `Home`.
 *
 * The cycle fixture, and it has to be built this way round: the containing
 * Space is withheld from the list outright, so the only cycle an author can
 * still propose is one that closes through a Space that already points back.
 */
const otherReferencingHome: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...other,
  things: [
    ...other.things,
    {
      id: OTHER_TO_HOME_ID,
      document: {
        title: 'Home',
        kind: 'space',
        spaceId: HOME_ID,
        diagram: HOME_DIAGRAM_ID,
        graph: HOME_GRAPH_ID,
      },
    },
  ],
});

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

interface MountInjections {
  readonly newId?: () => UUID;
  readonly control?: MemorySpaceBackendTestControl;
}

interface Mounted {
  readonly backend: MemorySpaceBackend;
  readonly session: SpaceSession;
  /** The composition behind the surface, for the operations only a browser navigation reaches. */
  readonly app: ReturnType<typeof composeApp>;
}

/**
 * Mount the app on `Home`, with `Meta` and `Other` stored beside it.
 *
 * `broken` replaces part of the real authoring, which is the only way to reach
 * the outcomes below: the lifecycle refuses rather than rejects for everything
 * it can name, so a rejection means an invariant it does not name has broken
 * and no fixture can produce one.
 */
function mount(
  otherSnapshot: SpaceSnapshot = other,
  broken: Partial<SpaceThingAuthoring> = {},
  reportObserverError?: ObserverErrorReporter,
  /**
   * The two injections only some tests name: the minter a coordinated Edit
   * draws its identities from (ADR 0016), and the control that decides what a
   * commit answers.
   */
  { newId = newUuid, control }: MountInjections = {},
): Mounted {
  const backend = new MemorySpaceBackend(
    META_ID,
    [
      { snapshot: meta(otherSnapshot), revision: 0n, exportedRevision: null },
      { snapshot: home, revision: 0n, exportedRevision: null },
      { snapshot: otherSnapshot, revision: 0n, exportedRevision: null },
    ],
    control,
  );
  const stored = { snapshot: home, revision: 0n, exportedRevision: null };
  const { spaceSession: session, spaceThings: authoring } = openTestSpace(backend, stored, newId);
  const spaceThings: SpaceThingAuthoring = { ...authoring, ...broken };
  const app = composeApp({ spaceSession: session, reportObserverError });
  let view: RenderResult | undefined;
  mountSpace(
    {
      id: runtime(home).id,
      session,
      app,
      spaceThings,
    },
    (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    },
  );
  return { backend, session, app };
}

const thingsOf = (session: SpaceSession) => session.getState().working.things;

/** The Space Things `Home` holds, in authored order. */
const spaceThingsOf = (session: SpaceSession) =>
  thingsOf(session).flatMap((thing) =>
    thing.document.kind === 'space' ? [{ id: thing.id, document: thing.document }] : [],
  );

/**
 * Persistence is asynchronous and a coordinated Edit writes several Spaces, so
 * a test that ends the moment it has asserted leaves the answer to land against
 * an unmounted tree.
 */
const settled = (session: SpaceSession): Promise<void> =>
  waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

/** Wait for the Things to reach the canvas, which is what makes Thing authoring available. */
async function readyToAuthor(): Promise<void> {
  const create = await screen.findByRole('button', { name: 'Create Thing' });
  await waitFor(() => expect(unavailable(create)).toBe(false));
}

/** Reach Create Space Thing the way an author does: through the Create Thing menu. */
async function openSpaceThingCreation(): Promise<void> {
  await readyToAuthor();
  createThing('Space Thing');
  await screen.findByTestId('new-space-thing');
}

/**
 * Choose one row of the pane's target list.
 *
 * The list is Base UI's own, so it is opened and committed the way that
 * primitive expects: a keyboard press on the trigger to open, then the full
 * pointer sequence on the row, because a bare `click` reaches the item before
 * the pointer handlers that select it.
 */
function chooseTarget(name: string): void {
  fireEvent.keyDown(screen.getByTestId('new-space-thing-target'), { key: 'ArrowDown' });
  const option = screen.getByRole('option', { name });
  fireEvent.pointerDown(option, { button: 0 });
  fireEvent.pointerUp(option, { button: 0 });
  fireEvent.click(option);
}

/**
 * Open a Space Thing on the canvas and wait for its selectors.
 *
 * Both waits are real: the Thing reaches the canvas with the asynchronous
 * placement, and its target is a *second* Space read after the Thing is already
 * drawn — until that read lands the Open Thing draws its waiting note in place
 * of the two controls.
 */
async function openSpaceThing(title: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: `Open Thing ${title}` }));
  await screen.findByTestId('space-thing-diagram');
}

/**
 * Choose one row of an Open Space Thing's selector.
 *
 * Base UI's own list, driven the way the primitive expects: a keyboard press on
 * the trigger to open, then the full pointer sequence on the row, because a bare
 * `click` reaches the item before the pointer handlers that select it.
 */
function chooseSelection(testId: string, name: string): void {
  fireEvent.keyDown(screen.getByTestId(testId), { key: 'ArrowDown' });
  const option = screen.getByRole('option', { name });
  fireEvent.pointerDown(option, { button: 0 });
  fireEvent.pointerUp(option, { button: 0 });
  fireEvent.click(option);
}

/** Type a title and confirm, which is the whole of the pane's completion. */
function createNamed(title: string): void {
  fireEvent.change(screen.getByTestId('new-space-thing-title'), { target: { value: title } });
  fireEvent.click(screen.getByTestId('new-space-thing-create'));
}

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        return undefined;
      }
      unobserve(): void {
        return undefined;
      }
      disconnect(): void {
        return undefined;
      }
    },
  );
  // Base UI's Select positioner measures, and jsdom ships neither pointer
  // capture nor `scrollIntoView`; both are reached before a list can open.
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

afterAll(() => vi.unstubAllGlobals());

describe('Add Space Thing', () => {
  it('is reached through the Add Thing menu and opens its creation pane', async () => {
    const { session } = mount();

    await openSpaceThingCreation();

    expect(screen.getByRole('dialog', { name: 'New Space Thing' })).toBeVisible();
    expect(screen.getByTestId('new-space-thing-title')).toHaveValue('');
    expect(screen.getByTestId('new-space-thing-target')).toHaveTextContent('A new Space');
    await settled(session);
  });

  /**
   * One typed title seeds three things — the Thing, the Space it references and
   * that Space's first Markdown Thing — and only the first two take the title.
   * The Space's first Thing is the neutral `Thing 1` every new Space begins with,
   * because content titled after the Space it lives in only reads as deliberate
   * until the first rename makes the pair disagree (ADR 0068).
   */
  it('creates a Space Thing and the new Space it references from one title', async () => {
    const { backend, session } = mount();
    await openSpaceThingCreation();

    chooseTarget('A new Space');
    createNamed('Architecture');

    await waitFor(() => expect(screen.queryByTestId('new-space-thing')).not.toBeInTheDocument());
    const created = spaceThingsOf(session);
    expect(created).toHaveLength(1);
    expect(created[0]?.document.title).toBe('Architecture');

    const targetId = created[0]!.document.spaceId;
    const target = await backend.loadSpace(targetId);
    expect(target?.snapshot.document.title).toBe('Architecture');
    expect(target?.snapshot.things.map((thing) => thing.document)).toEqual([
      { title: 'Thing 1', kind: 'markdown', body: '' },
    ]);
    await settled(session);
  });

  /**
   * Creating a Thing and renaming one are the same rule about what a Title is,
   * and a `trim()` on this pane made them two rules. A whole-string trim strips
   * the leading whitespace ADR 0083 says is the first line's own, so the same
   * typed bytes produced one Title through the pane and another through the
   * rename — with the rename reported as an Edit rather than as changing
   * nothing.
   */
  it('stores the Title the schema stores, so a rename to the same bytes is no Edit', async () => {
    const { session } = mount();
    await openSpaceThingCreation();

    chooseTarget('A new Space');
    createNamed('  Recap');

    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(1));
    expect(spaceThingsOf(session)[0]?.document.title).toBe('  Recap');
    await settled(session);
  });

  /**
   * The seeding is a convenience at creation and never a link afterwards: the
   * Thing and the Space it references are separate entities from the moment they
   * exist, and the Thing's Title is the containing Space's to author.
   */
  it('leaves the target Space’s title alone when the Thing is renamed', async () => {
    const { backend, session } = mount();
    await openSpaceThingCreation();
    chooseTarget('A new Space');
    createNamed('Architecture');
    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(1));
    const targetId = spaceThingsOf(session)[0]!.document.spaceId;

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title Architecture' }));
    const editor = await screen.findByRole('textbox', { name: 'Thing title' });
    fireEvent.change(editor, { target: { value: 'The architecture' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(spaceThingsOf(session)[0]?.document.title).toBe('The architecture');
    await waitFor(async () =>
      expect((await backend.loadSpace(targetId))?.snapshot.document.title).toBe('Architecture'),
    );
    await settled(session);
  });

  /**
   * Referencing is not copying. The same Thing shape reaches an existing Space,
   * so what tells the two paths apart is the Space count either side of the
   * Edit — one more for a creation, unchanged for a reference.
   */
  it('references an existing Space instead of creating a second one', async () => {
    const { backend, session } = mount();
    await openSpaceThingCreation();

    chooseTarget('Other Space');
    createNamed('The other one');

    await waitFor(() => expect(screen.queryByTestId('new-space-thing')).not.toBeInTheDocument());
    expect(spaceThingsOf(session).map((thing) => thing.document)).toEqual([
      {
        title: 'The other one',
        kind: 'space',
        spaceId: OTHER_ID,
        diagram: OTHER_DIAGRAM_ID,
        graph: OTHER_GRAPH_ID,
      },
    ]);
    expect(await backend.listSpaces()).toHaveLength(3);
    await settled(session);
  });

  /**
   * An already-initialized target is read, not re-made.
   *
   * What the Thing records is the Diagram that Space itself opens on and that
   * Diagram's own Active Graph (ADR 0079, ADR 0026) — `Current` and not `Draft`,
   * which is the only thing `Collection 1`'s two Graphs are here to tell apart.
   * The target's stored document is asserted whole, because initialization is a
   * commit and a commit that ran against a Space needing nothing would show up
   * nowhere else.
   */
  it('takes an initialized target’s opening selection and initializes nothing', async () => {
    const { backend, session } = mount();
    await openSpaceThingCreation();

    chooseTarget('Other Space');
    createNamed('The other one');

    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(1));
    expect(spaceThingsOf(session)[0]?.document).toMatchObject({
      diagram: OTHER_DIAGRAM_ID,
      graph: OTHER_GRAPH_ID,
    });
    const stored = await backend.loadSpace(OTHER_ID);
    expect(stored?.snapshot.document).toEqual(other.document);
    await settled(session);
  });

  /**
   * A diagramless target is initialized before the Thing that shows it exists.
   *
   * A Space Thing names a Diagram of its target and a Graph that Diagram owns
   * (ADR 0079), so a Space with neither offers nothing to name. The lifecycle
   * makes the target working first — the durable initialization ADR 0079 gives
   * first working load — and stores exactly what that minted. Both halves are
   * asserted because either alone would pass against a Thing carrying two ids
   * the stored Space had never heard of.
   */
  it('initializes a diagramless target and stores what initialization minted', async () => {
    const { backend, session } = mount(diagramlessOther, {}, undefined, {
      newId: mintingIds(MINTED_DIAGRAM_ID, MINTED_GRAPH_ID, MINTED_THING_ID),
    });
    await openSpaceThingCreation();

    chooseTarget('Other Space');
    createNamed('The other one');

    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(1));
    expect(spaceThingsOf(session)[0]).toEqual({
      id: MINTED_THING_ID,
      document: {
        title: 'The other one',
        kind: 'space',
        spaceId: OTHER_ID,
        diagram: MINTED_DIAGRAM_ID,
        graph: MINTED_GRAPH_ID,
      },
    });
    const stored = await backend.loadSpace(OTHER_ID);
    expect(stored?.snapshot.document.defaultDiagram).toBe(MINTED_DIAGRAM_ID);
    expect(stored?.snapshot.document.diagrams).toEqual([
      {
        id: MINTED_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: MINTED_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: MINTED_GRAPH_ID,
      },
    ]);
    // Initialized, not replaced: the Thing the Space already held is untouched.
    expect(stored?.snapshot.things).toEqual(diagramlessOther.things);
    expect(await backend.listSpaces()).toHaveLength(3);
    await settled(session);
  });

  /**
   * A target that could not be prepared makes nothing at all.
   *
   * Initialization is its own durable commit and it runs before the Edit
   * (ADR 0079), so a commit that fails leaves no Thing, no half-written
   * selection and a containing Space nobody touched. The author is told on the
   * **Target** field, because what answers it is choosing another Space —
   * exactly as for the aggregate refusals beside it.
   */
  it('creates nothing and names the Target when its target could not be prepared', async () => {
    const control = new MemorySpaceBackendTestControl();
    const { backend, session } = mount(diagramlessOther, {}, undefined, { control });
    await openSpaceThingCreation();
    chooseTarget('Other Space');
    const before = thingsOf(session);

    // Queued here rather than at mount so it is spent by the initialization
    // commit and not by whatever the opening of `Home` might have written.
    control.queueResult({
      kind: 'permanent-failure',
      code: 'invalid-commit',
      message: 'the target could not be written',
    });
    createNamed('The other one');

    const target = await screen.findByTestId('new-space-thing-target');
    await waitFor(() => expect(target).toHaveAttribute('aria-invalid', 'true'));
    expect(target).toHaveAccessibleDescription(
      'That Space could not be prepared to be shown here, so nothing was created.',
    );
    expect(screen.getByTestId('new-space-thing')).toBeVisible();
    expect(spaceThingsOf(session)).toEqual([]);
    expect(thingsOf(session)).toEqual(before);
    expect((await backend.loadSpace(OTHER_ID))?.snapshot.document.diagrams).toBeUndefined();
    await settled(session);
  });

  /**
   * Convergence is legal: a Space is reachable by however many references point
   * at it, and each is an ordinary Thing with its own Title (ADR 0074). Nothing
   * about the second reference is a second Space.
   */
  it('lets two Space Things reference one Space', async () => {
    const { backend, session } = mount();

    await openSpaceThingCreation();
    chooseTarget('Other Space');
    createNamed('One way in');
    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(1));
    await settled(session);

    await openSpaceThingCreation();
    chooseTarget('Other Space');
    createNamed('Another way in');
    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(2));

    expect(spaceThingsOf(session).map((thing) => thing.document.title)).toEqual([
      'One way in',
      'Another way in',
    ]);
    expect(spaceThingsOf(session).map((thing) => thing.document.spaceId)).toEqual([
      OTHER_ID,
      OTHER_ID,
    ]);
    // Both begin at what the Space itself opens on, because the selection is
    // read off the target rather than proposed by the author (ADR 0079).
    expect(
      spaceThingsOf(session).map(({ document }) => [document.diagram, document.graph]),
    ).toEqual([
      [OTHER_DIAGRAM_ID, OTHER_GRAPH_ID],
      [OTHER_DIAGRAM_ID, OTHER_GRAPH_ID],
    ]);
    expect(await backend.listSpaces()).toHaveLength(3);
    await settled(session);
  });

  /**
   * Two references to one Space are two selections, and neither is the other's.
   *
   * This is the behaviour that requiring the pair buys over deriving it. While
   * a Space Thing with nothing stored read its Diagram through the target's own
   * `defaultDiagram`, two Things on one Space could only ever show the same
   * Diagram — so one Thing showing `Collection 1` beside another showing
   * `Collection 2` was not expressible at all.
   *
   * The selection is changed through the on-canvas selector, which is the only
   * surface that changes one: the creation pane offers no choice, because a
   * caller holding a listing row has no Diagram of the target to offer
   * (ADR 0068). And it is read back off the *stored* Space as well as the
   * session, since a selection that lived only in working state would be a view
   * preference rather than authored content.
   */
  it('keeps a selection per Space Thing, and stores both', async () => {
    const { backend, session } = mount();

    await openSpaceThingCreation();
    chooseTarget('Other Space');
    createNamed('One way in');
    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(1));
    await settled(session);

    await openSpaceThingCreation();
    chooseTarget('Other Space');
    createNamed('Another way in');
    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(2));
    await settled(session);

    await openSpaceThing('One way in');
    chooseSelection('space-thing-diagram', 'Collection 2');

    await waitFor(() =>
      expect(
        spaceThingsOf(session).map(({ document }) => [
          document.title,
          document.diagram,
          document.graph,
        ]),
      ).toEqual([
        ['One way in', OTHER_SECOND_DIAGRAM_ID, OTHER_SECOND_GRAPH_ID],
        ['Another way in', OTHER_DIAGRAM_ID, OTHER_GRAPH_ID],
      ]),
    );
    await settled(session);

    const stored = await backend.loadSpace(HOME_ID);
    expect(
      stored?.snapshot.things.flatMap((thing) =>
        thing.document.kind === 'space' ? [thing.document] : [],
      ),
    ).toEqual(spaceThingsOf(session).map((thing) => thing.document));
  });

  /**
   * A cycle is refused by the aggregate rather than filtered out of the list,
   * and the refusal is the better answer: it names the Things that formed the
   * loop, where a silently shorter list would have said nothing at all.
   *
   * So the pane has to survive its own refusal. The Target field is the one
   * thing on screen that could answer it — choose a different Space — and
   * closing the pane would take that field away with it.
   */
  it('refuses a choice that would make a Space contain itself, and keeps the field that answers it', async () => {
    const { session } = mount(otherReferencingHome);
    await openSpaceThingCreation();

    chooseTarget('Other Space');
    createNamed('Back around');

    const target = await screen.findByTestId('new-space-thing-target');
    await waitFor(() => expect(target).toHaveAttribute('aria-invalid', 'true'));
    expect(target).toHaveAccessibleDescription('A space thing would make a space contain itself.');
    expect(screen.getByTestId('new-space-thing')).toBeVisible();
    expect(spaceThingsOf(session)).toEqual([]);
    await settled(session);
  });

  /**
   * A Space Thing always has a valid target available — a new Space — so the
   * choice is never what is missing. The title is, which is why this pane has a
   * Create button where Alias creation completes on the choice itself.
   */
  it('withholds Create until the Thing has been named', async () => {
    const { session } = mount();
    await openSpaceThingCreation();

    expect(screen.getByTestId('new-space-thing-create')).toBeDisabled();

    fireEvent.change(screen.getByTestId('new-space-thing-title'), { target: { value: '  ' } });
    expect(screen.getByTestId('new-space-thing-create')).toBeDisabled();

    fireEvent.change(screen.getByTestId('new-space-thing-title'), { target: { value: 'Named' } });
    expect(screen.getByTestId('new-space-thing-create')).toBeEnabled();
    await settled(session);
  });

  /**
   * The creation state is the surface's own and nothing else (ADR 0042): no
   * Thing, no Space, no commit until Create is pressed. Escape is Cancel's
   * meaning on this pane rather than a second gesture (ADR 0048), so the two
   * are one behaviour and are asserted as one.
   */
  it.each([
    {
      name: 'Cancel',
      dismiss: () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })),
    },
    {
      name: 'Escape',
      dismiss: () =>
        fireEvent.keyDown(screen.getByTestId('new-space-thing-title'), { key: 'Escape' }),
    },
  ])('creates nothing when it is dismissed with $name', async ({ dismiss }) => {
    const { backend, session } = mount();
    await openSpaceThingCreation();
    fireEvent.change(screen.getByTestId('new-space-thing-title'), {
      target: { value: 'Abandoned' },
    });
    chooseTarget('Other Space');

    dismiss();

    await waitFor(() => expect(screen.queryByTestId('new-space-thing')).not.toBeInTheDocument());
    expect(spaceThingsOf(session)).toEqual([]);
    expect(thingsOf(session)).toEqual(home.things);
    expect(await backend.listSpaces()).toHaveLength(3);
    await settled(session);
  });
});

/**
 * The three outcomes the coordination can have that are not refusals.
 *
 * A refusal is an answer and the pane knows what to do with one. A rejection is
 * not: the registry throws outside its own try where a session it was
 * coordinating has gone, and the transport rejects on a timeout or a non-OK
 * status. None of the three is a state the author can be left holding, because
 * the running state disables both of this pane's exits.
 */
describe('a coordination that broke rather than refused', () => {
  /**
   * The exits come back, and so does a sentence saying why they are needed.
   *
   * Both halves are one behaviour: an author who presses Create and is handed
   * working controls back has been told the attempt is over and nothing else,
   * and pressing Create again does the same thing again. A rejection names no
   * field — the lifecycle refuses for everything it can name — so what threw is
   * said in the pane's form channel, untranslated, exactly as `DeleteThingControl`
   * says it: a refusal code is a stable domain identity (ADR 0057) and nothing
   * here answers to one.
   *
   * The one app-level test of a rejection. The transitions behind it — the
   * exits coming back, a dismissal refused while the Edit runs, a failed
   * listing — are `thing-creation-state.test.ts`'s, driven with no React tree; this
   * proves the pane reaches that module and draws what it answers.
   */
  it('says what broke when a create rejects', async () => {
    // The rejection is reported too, since nothing else would say what broke.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { session } = mount(other, {
      create: () => Promise.reject(new Error('the coordination lost a session')),
    });
    await openSpaceThingCreation();

    createNamed('Architecture');

    expect(
      await screen.findByText('This Thing was not created: the coordination lost a session'),
    ).toBeVisible();
    expect(screen.getByTestId('new-space-thing')).toBeVisible();
    expect(consoleError).toHaveBeenCalled();
    await settled(session);
  });

  /**
   * Reported through the sink the composition was given, not a second one.
   *
   * `thing-creation.ts` requires `reportBreak` with no default for the reason
   * ADR 0016 gives, and a surface that answers that requirement with its own
   * `console.error` puts back exactly the invisible reporter the requirement
   * exists to prevent: a host that installed a sink of its own would never
   * see this failure.
   */
  it('reports a rejected create through the sink the composition was given', async () => {
    const reported = vi.fn();
    const { session } = mount(
      other,
      { create: () => Promise.reject(new Error('the coordination lost a session')) },
      reported,
    );
    await openSpaceThingCreation();

    createNamed('Architecture');

    expect(
      await screen.findByText('This Thing was not created: the coordination lost a session'),
    ).toBeVisible();
    expect(reported).toHaveBeenCalled();
    await settled(session);
  });

  /**
   * A lifecycle that changed nothing did not create a Thing.
   *
   * `SpaceThingLifecycleResult` has three arms and only `refused` says a field
   * is wrong, so an `unchanged` answered as a creation would close the pane and
   * return the author to Add Thing believing a Space Thing exists that was never
   * made. Named the way `createAlias` names its own arms, so the compiler asks
   * again the day a fourth joins the union.
   */
  it('leaves the pane open when the lifecycle answers unchanged', async () => {
    const create = vi.fn<SpaceThingAuthoring['create']>(() =>
      Promise.resolve({ kind: 'unchanged' }),
    );
    const { session } = mount(other, { create });

    await openSpaceThingCreation();
    chooseTarget('A new Space');
    createNamed('Architecture');

    await waitFor(() => expect(screen.getByTestId('new-space-thing-create')).toBeEnabled());
    // The attempt is what makes the three assertions below evidence: an open
    // pane, live exits and no Space Thing are also exactly what a Create that
    // never reached the lifecycle would leave behind.
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'New Space Thing' })).toBeVisible();
    expect(spaceThingsOf(session)).toHaveLength(0);
    await settled(session);
  });

  /**
   * A read that rejected is reported too, and it is the one failure on this
   * pane that was not: the seam answers an unreadable list rather than
   * rejecting, so the shell's own reporting arm never runs and the transport
   * error was shown to the author and then discarded.
   */
  it('reports a stored-Spaces read that rejected, as well as saying so', async () => {
    const reported = vi.fn();
    const { session } = mount(
      other,
      { referenceableSpaces: () => Promise.reject(new Error('the transport timed out')) },
      reported,
    );

    await openSpaceThingCreation();

    expect(
      await screen.findByText(
        'The stored Spaces could not be read, so this edit was not attempted.',
      ),
    ).toBeVisible();
    expect(reported).toHaveBeenCalled();
    await settled(session);
  });

  /**
   * The pane says it is working, rather than only going quiet.
   *
   * A coordinated Edit spans several Spaces and answers asynchronously
   * (ADR 0076), and while it runs both exits are withheld. Disabled controls
   * and a dead Escape are indistinguishable from a surface that has broken, so
   * the wait is stated on the dialog itself rather than left to be inferred
   * from what has stopped working.
   */
  it('reports itself busy while a create is in flight', async () => {
    // Never settled, which is the whole of the state under test.
    const { session } = mount(other, { create: () => new Promise<never>(() => undefined) });
    await openSpaceThingCreation();

    createNamed('Architecture');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled());
    expect(screen.getByRole('dialog', { name: 'New Space Thing' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await settled(session);
  });

  /**
   * Presenting takes the pane away, and an Edit in flight is what it waits for.
   *
   * Presenting is reachable while the pane is open even though the pane is
   * modal: Back onto a presenting Thing URL is a browser navigation, and the
   * `popstate` a focus trap does not see reopens the presentation. Closing on
   * that would be the abandonment the pane already refuses to make itself —
   * Cancel and Escape are both withheld while a coordinated Edit is running,
   * because the Edit completes whether or not the surface that began it is
   * still there. So the pane stays until the Edit answers, and the answer is
   * what takes it away.
   */
  it('keeps the pane over a presentation entered while a create is in flight', async () => {
    const { session, app } = mount(other, { create: () => new Promise<never>(() => undefined) });
    await openSpaceThingCreation();

    createNamed('Architecture');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled());

    act(() => app.navigation.openPresentation(HOME_DIAGRAM_ID, HOME_GRAPH_ID, HOME_THING_ID));

    expect(screen.getByRole('dialog', { name: 'New Space Thing' })).toBeVisible();
    await settled(session);
  });

  /**
   * Every exit from the pane leaves focus somewhere, including the one that
   * works.
   *
   * Cancel and Escape hand it back to the control the menu was opened from.
   * Creating an Alias hands it to the editor that opens on the Alias, and taking
   * it back would be a steal — but this pane has no naming continuation, because
   * the title was typed on it before the Edit ran. So there is nothing to hand
   * it to and the Add Thing trigger is where it belongs, exactly as after a
   * cancellation.
   */
  it('returns focus to the Add Thing menu after creating a Space Thing', async () => {
    const { session } = mount();
    await openSpaceThingCreation();

    createNamed('Architecture');

    await waitFor(() => expect(screen.queryByTestId('new-space-thing')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Thing' })).toHaveFocus());
    await settled(session);
  });

  /**
   * The listing failure outlives the keystroke that would withdraw a refusal.
   *
   * Editing a field ends the *attempt* a refusal described, which is why the
   * pane withdraws one. An unreadable listing describes neither an attempt nor
   * a field: it says the list beside them is short for a reason. Create is
   * disabled until the Thing is titled, so withdrawing it on the first keystroke
   * would put the author in front of "A new Space" alone with nothing left
   * saying why — which is the duplicate this message exists to prevent.
   */
  it('keeps the unreadable-listing message while the author types a title', async () => {
    const { session } = mount(other, {
      referenceableSpaces: () => Promise.reject(new Error('the transport timed out')),
    });
    const unreadable = 'The stored Spaces could not be read, so this edit was not attempted.';

    await openSpaceThingCreation();
    expect(await screen.findByText(unreadable)).toBeVisible();
    fireEvent.change(screen.getByTestId('new-space-thing-title'), {
      target: { value: 'Architecture' },
    });

    expect(screen.getByText(unreadable)).toBeVisible();
    await settled(session);
  });
});

/**
 * Creating before the author has been shown what is already stored.
 *
 * The target list is read when the pane opens (ADR 0068), so there is a moment
 * — and, when the read fails, a state that never ends — in which the only row
 * on offer is "A new Space". The title is the pane's completion, so nothing
 * about the list stops an author typing one and pressing Create, and what they
 * get is a *second* Space named after the one they meant to reference. The two
 * states are told apart on purpose: a listing still in flight is an ordinary
 * wait and says so, and only a listing that failed is a refusal.
 *
 * "Created nothing" is asserted through Cancel rather than only through the
 * Thing count: the pane withholds Create until the listing has been read, so a
 * still-enabled Cancel is the evidence that no coordinated Edit was begun at
 * all — the pane never goes busy — where a count read straight after a click
 * would pass against one that had merely not landed yet.
 */
describe('creating before the target list has been seen', () => {
  /** Never settles, which is the whole of the state under test. */
  const unread = { referenceableSpaces: () => new Promise<never>(() => undefined) };
  const unreadable = 'The stored Spaces could not be read, so this edit was not attempted.';

  it('withholds Create while the stored Spaces are still being read', async () => {
    const { session } = mount(other, unread);
    await openSpaceThingCreation();

    fireEvent.change(screen.getByTestId('new-space-thing-title'), {
      target: { value: 'Other Space' },
    });

    expect(await screen.findByText('Reading the stored Spaces…')).toBeVisible();
    expect(screen.getByTestId('new-space-thing-create')).toBeDisabled();
    // A wait is not a failure, so nothing on the pane reads as one.
    expect(screen.queryByText(unreadable)).not.toBeInTheDocument();
    await settled(session);
  });

  it('begins no Edit while the stored Spaces are still being read', async () => {
    const { session } = mount(other, unread);
    await openSpaceThingCreation();

    createNamed('Other Space');

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.getByTestId('new-space-thing')).toBeVisible();
    expect(spaceThingsOf(session)).toHaveLength(0);
    await settled(session);
  });

  it('withholds Create when the stored Spaces could not be read', async () => {
    // The read is reported as well as shown — proved by its own test above —
    // and this test is about the pane, so the sink is only silenced here.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { session } = mount(other, {
      referenceableSpaces: () => Promise.reject(new Error('the transport timed out')),
    });
    await openSpaceThingCreation();
    expect(await screen.findByText(unreadable)).toBeVisible();

    createNamed('Other Space');

    expect(screen.getByTestId('new-space-thing-create')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(spaceThingsOf(session)).toHaveLength(0);
    await settled(session);
  });
});
