import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from '@testing-library/react';
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
/**
 * `Collection 1` owns two Graphs and has authored the second as its Active one.
 *
 * The asymmetry is the fixture's job: a selection seeded from the head of the
 * list and one seeded from the Diagram's own Active Graph agree everywhere a
 * Diagram owns one Graph, so only a Diagram like this can say which rule ran
 * (ADR 0026).
 */
const OTHER_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
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

/** The canvas node one Thing is drawn as, which is how a caret is placed by id. */
const nodeFor = (id: UUID): HTMLElement | null =>
  document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);

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
  const create = await screen.findByRole('button', { name: 'Create Markdown Thing' });
  await waitFor(() => expect(unavailable(create)).toBe(false));
}

/**
 * Create a Space Thing the way an author does: one press of its own Dock
 * control, which completes the Edit (ADR 0089).
 *
 * Wrapped in `act` because the lifecycle is asynchronous: the press returns
 * before the coordination has installed anything, and the state it installs
 * arrives on a later tick.
 */
async function createSpaceThing(): Promise<void> {
  await readyToAuthor();
  await act(async () => {
    createThing('Space Thing');
    // The press returns before the coordination has installed anything, so the
    // hop is what lets that installation land inside `act`.
    await Promise.resolve();
  });
}

/**
 * Open the Things list, which is where an *existing* Space is referenced from.
 *
 * Idempotent, because a Space row does not take itself away: the list stays open
 * across an add, so a second reference is one more press on a row rather than a
 * second disclosure — and pressing the trigger again would close it.
 */
async function openThingsList(): Promise<HTMLElement> {
  const open = screen.queryByRole('dialog', { name: 'Things' });
  if (open !== null) return open;
  fireEvent.click(screen.getByRole('button', { name: 'Things' }));
  return await screen.findByRole('dialog', { name: 'Things' });
}

/**
 * Reference a Space that already exists — the Things list's add-Space row.
 *
 * The other half of what the retired creation pane did, and the half ADR 0089
 * keeps as a gesture of its own: making a Space and pointing at one that exists
 * are different acts, and this one lists real Spaces with search where the pane
 * offered a sentinel row beside them.
 */
async function addExistingSpace(title: string): Promise<void> {
  await readyToAuthor();
  await openThingsList();
  const row = await screen.findByRole('button', { name: `Add ${title} to Diagram` });
  await act(async () => {
    fireEvent.click(row);
    await Promise.resolve();
  });
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

describe('Create Space Thing', () => {
  it('accepts only one Space creation before its local Edit installs', async () => {
    const { session } = mount();
    await readyToAuthor();
    await act(async () => {
      createThing('Space Thing');
      createThing('Space Thing');
      await Promise.resolve();
    });
    await settled(session);
    expect(spaceThingsOf(session)).toHaveLength(1);
    const editor = await screen.findByRole('textbox', { name: 'Thing title' });
    expect(editor).toHaveValue('Space 1');
    expect(editor).toHaveFocus();
    fireEvent.keyDown(editor, { key: 'Escape' });
    await createSpaceThing();
    await settled(session);
    expect(spaceThingsOf(session).map((thing) => thing.document.title)).toEqual([
      'Space 1',
      'Space 2',
    ]);
  });

  /**
   * One press mints three things — the Thing, the Space it names and that
   * Space's first Markdown Thing — and the first two take one `Space N`.
   *
   * `Space N` is numbered over the containing Space's own Thing titles, which is
   * the only source that can be read synchronously; the Space and the Thing get
   * the same string, so they agree at creation exactly as the retired pane's
   * typed title made them (ADR 0089). The target's first Thing is the neutral
   * `Thing 1` every new Space begins with, because content titled after the
   * Space it lives in only reads as deliberate until the first rename makes the
   * pair disagree (ADR 0068).
   */
  it('creates a Space Thing and the new Space it names from one Space N', async () => {
    const { backend, session } = mount();

    await createSpaceThing();

    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(1));
    const created = spaceThingsOf(session);
    expect(created[0]?.document.title).toBe('Space 1');

    const targetId = created[0]!.document.spaceId;
    const target = await backend.loadSpace(targetId);
    expect(target?.snapshot.document.title).toBe('Space 1');
    expect(target?.snapshot.things.map((thing) => thing.document)).toEqual([
      { title: 'Thing 1', kind: 'markdown', body: '' },
    ]);
    await settled(session);
  });

  /**
   * **The caret lands in the Thing, before the commit settles.**
   *
   * This is the optimistic half of ADR 0089: the coordination installs its local
   * Edit and *then* commits two snapshots, and the press continues at the Thing
   * as soon as that installation lands rather than waiting for the durable
   * write. So the editor is open over a Thing whose Space is still being
   * written — which is the point, not an implementation detail.
   */
  it('continues in the created Thing’s own Title editor', async () => {
    const { session } = mount();

    await createSpaceThing();

    const editor = await screen.findByRole('textbox', { name: 'Thing title' });
    expect(editor).toHaveValue('Space 1');
    expect(editor).toHaveFocus();
    await settled(session);
  });

  /**
   * **The window between the press and the installed Edit belongs to the press
   * that opened it.**
   *
   * The coordinated Edit lands one await after the gesture, and nothing closes
   * the surface meanwhile — `createDisabled` answers availability, not
   * re-entrancy — so a second creation can install inside it. `addThing` is
   * synchronous and lands immediately, so both Things are new when the Space
   * Thing's Edit resolves, and a creation that asked *which Things appeared*
   * would take the earlier array position and open the caret over a Markdown
   * Thing the author is about to type a Space's name into.
   *
   * The lifecycle answers the Thing it made, so the question is never asked.
   */
  it('continues in its own Thing when a Markdown Thing lands in the same window', async () => {
    const { session } = mount();
    await readyToAuthor();

    await act(async () => {
      createThing('Space Thing');
      // Synchronous, and inside the window the coordination is still open for.
      createThing('Markdown Thing');
      await Promise.resolve();
    });

    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(1));
    const spaceThing = spaceThingsOf(session)[0]!;
    const markdown = thingsOf(session).filter(
      (thing) =>
        thing.document.kind === 'markdown' && !home.things.some(({ id }) => id === thing.id),
    );
    expect(markdown).toHaveLength(1);

    const editor = await screen.findByRole('textbox', { name: 'Thing title' });
    expect(editor).toHaveValue('Space 1');
    expect(nodeFor(spaceThing.id)).toContainElement(editor);
    expect(markdown[0]?.document.title).toBe('Thing 1');
    await settled(session);
  });

  /**
   * The seeding is a convenience at creation and never a link afterwards: the
   * Thing and the Space it names are separate entities from the moment they
   * exist, and the Thing's Title is the containing Space's to author.
   */
  it('leaves the target Space’s title alone when the Thing is renamed', async () => {
    const { backend, session } = mount();
    await createSpaceThing();
    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(1));
    const targetId = spaceThingsOf(session)[0]!.document.spaceId;

    const editor = await screen.findByRole('textbox', { name: 'Thing title' });
    fireEvent.change(editor, { target: { value: 'The architecture' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    await waitFor(() => expect(spaceThingsOf(session)[0]?.document.title).toBe('The architecture'));
    await waitFor(async () =>
      expect((await backend.loadSpace(targetId))?.snapshot.document.title).toBe('Space 1'),
    );
    await settled(session);
  });

  /**
   * A refused creation leaves nothing standing, and says what died.
   *
   * The lifecycle answers its refusal as it installs, so a refusal arrives with
   * no Thing ever drawn — which is what "removed on refusal" amounts to from
   * out here. What the author needs is the sentence, because the gesture they
   * made looked exactly like the one that works, and the Dock's refusal channel
   * is where a creation with no pane of its own reports (ADR 0089).
   */
  it('creates nothing and names the Space when the lifecycle refuses', async () => {
    const { session } = mount(other, {
      create: () =>
        Promise.resolve({ kind: 'refused', refusal: { code: 'persistence-read-failed' } }),
    });

    await createSpaceThing();

    expect(await screen.findByText('Space not created')).toBeVisible();
    expect(spaceThingsOf(session)).toEqual([]);
    expect(thingsOf(session)).toEqual(home.things);
    expect(screen.queryByRole('textbox', { name: 'Thing title' })).toBeNull();
    await settled(session);
  });

  it.each(['refused', 'rejected'] as const)(
    'allows another attempt after a %s creation',
    async (outcome) => {
      const create = vi
        .fn<SpaceThingAuthoring['create']>()
        .mockImplementationOnce(() =>
          outcome === 'refused'
            ? Promise.resolve({ kind: 'refused', refusal: { code: 'persistence-read-failed' } })
            : Promise.reject(new Error('coordination failed')),
        )
        .mockResolvedValue({ kind: 'unchanged' });
      const { session } = mount(other, { create }, vi.fn());
      await createSpaceThing();
      expect(await screen.findByText('Space not created')).toBeVisible();
      await createSpaceThing();
      expect(create).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Space not created')).toBeNull();
      await settled(session);
    },
  );

  /**
   * A lifecycle that changed nothing did not create a Thing.
   *
   * `SpaceThingCreationResult` has three arms and only `refused` says something
   * is wrong, so an `unchanged` answered as a creation would open a Title editor
   * over a Thing that was never made. Named the way the other arms are, so the
   * compiler asks again the day a fourth joins the union.
   */
  it('creates nothing and reports nothing when the lifecycle answers unchanged', async () => {
    const create = vi.fn<SpaceThingAuthoring['create']>(() =>
      Promise.resolve({ kind: 'unchanged' }),
    );
    const { session } = mount(other, { create });

    await createSpaceThing();

    expect(create).toHaveBeenCalledTimes(1);
    expect(spaceThingsOf(session)).toHaveLength(0);
    expect(screen.queryByText('Space not created')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Thing title' })).toBeNull();
    await settled(session);
  });

  /**
   * A rejection is not an answer.
   *
   * The registry throws outside its own try where a session it was coordinating
   * has gone, and the transport rejects on a timeout or a non-OK status. The
   * lifecycle refuses for everything it can name, so a rejection means an
   * invariant it does not name has broken — said in the Dock's channel,
   * untranslated, because a refusal code is a stable domain identity (ADR 0057)
   * and nothing here answers to one.
   */
  it('says what broke when a create rejects', async () => {
    // The rejection is reported too, since nothing else would say what broke.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { session } = mount(other, {
      create: () => Promise.reject(new Error('the coordination lost a session')),
    });

    await createSpaceThing();

    expect(
      await screen.findByText('This Thing was not created: the coordination lost a session'),
    ).toBeVisible();
    expect(spaceThingsOf(session)).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    await settled(session);
  });

  /**
   * Reported through the sink the composition was given, not a second one.
   *
   * A surface that answers the reporting requirement with its own
   * `console.error` puts back exactly the invisible reporter ADR 0016 exists to
   * prevent: a host that installed a sink of its own would never see this.
   */
  it('reports a rejected create through the sink the composition was given', async () => {
    const reported = vi.fn();
    const { session } = mount(
      other,
      { create: () => Promise.reject(new Error('the coordination lost a session')) },
      reported,
    );

    await createSpaceThing();

    expect(
      await screen.findByText('This Thing was not created: the coordination lost a session'),
    ).toBeVisible();
    expect(reported).toHaveBeenCalled();
    await settled(session);
  });
});

/**
 * Referencing a Space that already exists, which is a different act.
 *
 * ADR 0089 splits the retired pane's two halves: Create Space Thing always makes
 * a Space, and pointing at one that exists is the Things list's add-Space row —
 * a list of real Spaces with search, where the pane offered a sentinel row
 * beside them. Everything the lifecycle's `link` arm answers is proved here,
 * through that row.
 */
describe('referencing an existing Space', () => {
  /**
   * Referencing is not copying. The same Thing shape reaches an existing Space,
   * so what tells the two paths apart is the Space count either side of the
   * Edit — one more for a creation, unchanged for a reference.
   */
  it('references an existing Space instead of creating a second one', async () => {
    const { backend, session } = mount();

    await addExistingSpace('Other Space');

    await waitFor(() =>
      expect(spaceThingsOf(session).map((thing) => thing.document)).toEqual([
        {
          title: 'Other Space',
          kind: 'space',
          spaceId: OTHER_ID,
          diagram: OTHER_DIAGRAM_ID,
          graph: OTHER_GRAPH_ID,
        },
      ]),
    );
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

    await addExistingSpace('Other Space');

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

    await addExistingSpace('Other Space');

    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(1));
    expect(spaceThingsOf(session)[0]).toEqual({
      id: MINTED_THING_ID,
      document: {
        title: 'Other Space',
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
   * A target that could not be prepared makes nothing at all, and says so on
   * the list that asked.
   *
   * Initialization is its own durable commit and it runs before the Edit
   * (ADR 0079), so a commit that fails leaves no Thing, no half-written
   * selection and a containing Space nobody touched. The sentence is the
   * `not-initialized` one, and asserting it whole is what separates this from a
   * Space that has gone: a failed commit is the transient arm, so it is the only
   * one that tells the author to try again.
   */
  it('creates nothing and says so when its target could not be prepared', async () => {
    const control = new MemorySpaceBackendTestControl();
    const { backend, session } = mount(diagramlessOther, {}, undefined, { control });
    await readyToAuthor();
    await openThingsList();
    const before = thingsOf(session);

    // Queued here rather than at mount so it is spent by the initialization
    // commit and not by whatever the opening of `Home` might have written.
    control.queueResult({
      kind: 'permanent-failure',
      code: 'invalid-commit',
      message: 'the target could not be written',
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Add Other Space to Diagram' }));
    });

    expect(
      await screen.findByText(
        'That Space could not be prepared to be shown here, so nothing was created. Try again.',
      ),
    ).toBeVisible();
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

    await addExistingSpace('Other Space');
    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(1));
    await settled(session);

    await addExistingSpace('Other Space');
    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(2));

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
   * surface that changes one: neither creation gesture offers a choice, because
   * a caller holding a listing row has no Diagram of the target to offer
   * (ADR 0068). And it is read back off the *stored* Space as well as the
   * session, since a selection that lived only in working state would be a view
   * preference rather than authored content.
   */
  it('keeps a selection per Space Thing, and stores both', async () => {
    const { backend, session } = mount();

    await addExistingSpace('Other Space');
    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(1));
    await settled(session);

    await addExistingSpace('Other Space');
    await waitFor(() => expect(spaceThingsOf(session)).toHaveLength(2));
    await settled(session);

    // Both Things carry the target's own name, because a Space stays offered
    // however many Things frame it and each row seeds its Thing from the Space
    // it names. So the first is found **by its id** rather than by its name or
    // by document order: two nodes answer that name, and React Flow orders its
    // nodes by draw order rather than by authored order — `findAllByRole(…)[0]`
    // passed against whichever it happened to draw first.
    const [authoredFirst] = spaceThingsOf(session);
    const node = document.querySelector(`.react-flow__node[data-id="${authoredFirst!.id}"]`);
    if (!(node instanceof HTMLElement)) throw new Error('The first Space Thing is not on canvas');
    fireEvent.click(within(node).getByRole('button', { name: 'Open Thing Other Space' }));
    await within(node).findByTestId('space-thing-diagram');
    fireEvent.click(within(node).getByTestId('space-thing-diagram'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Collection 2' }));

    await waitFor(() =>
      expect(
        spaceThingsOf(session).map(({ document }) => [document.diagram, document.graph]),
      ).toEqual([
        [OTHER_SECOND_DIAGRAM_ID, OTHER_SECOND_GRAPH_ID],
        [OTHER_DIAGRAM_ID, OTHER_GRAPH_ID],
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
   */
  it('refuses a choice that would make a Space contain itself', async () => {
    const { session } = mount(otherReferencingHome);

    await addExistingSpace('Other Space');

    expect(
      await screen.findByText('A space thing would make a space contain itself.'),
    ).toBeVisible();
    expect(spaceThingsOf(session)).toEqual([]);
    await settled(session);
  });
});
