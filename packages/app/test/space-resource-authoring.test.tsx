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
import type { SpaceResourceAuthoring } from '../src/space-resource-lifecycle';
import { createResource, createResourceControl, unavailable } from './command-dock';

/**
 * Creating a Space Resource, from the control an author actually has.
 *
 * The coordinated Edit underneath is proven at the lifecycle interface
 * (`space-resource-lifecycle.test.ts`) — atomicity, the reference cascade, every
 * persistence recovery — and nothing here re-derives any of it. What these
 * tests are about is the half that only exists once there is a surface: that
 * the menu reaches the pane, that one typed title seeds three entities and then
 * lets go of them, that referencing an existing Space adds a reference and
 * never a copy, and that a refusal keeps the field that could answer it.
 *
 * Every assertion about what was created is made against the backend and the
 * session rather than the canvas: a Space Resource creates a *second* Space, and
 * the containing Space's canvas is exactly the place that cannot show it.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_TO_OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const HOME_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const HOME_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const HOME_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const HOME_NEXT_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');

const OTHER_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const OTHER_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
/**
 * `Collection 1` owns two Graphs and has authored the second as its Active one.
 *
 * The asymmetry is the fixture's job: a selection seeded from the head of the
 * list and one seeded from the Map's own Active Graph agree everywhere a
 * Map owns one Graph, so only a Map like this can say which rule ran
 * (ADR 0026).
 */
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const OTHER_DRAFT_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const OTHER_SECOND_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const OTHER_SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000027');

/**
 * The three identities a reference to a mapless Space mints, in order.
 *
 * The Map and the Graph go first because initialization runs before the
 * Resource is authored at all (ADR 0079) — a target that could not be prepared
 * produces no Resource — and the Resource's own id is drawn last.
 */
const MINTED_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000030');
const MINTED_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000031');
const MINTED_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000032');

/**
 * The Meta Space over the ordinary Spaces below it.
 *
 * It is here because the aggregate demands it rather than because these tests
 * are about it: Meta is the sole root and every ordinary Space must be
 * referenced (ADR 0074), so a candidate that left `Home` unreachable would be
 * refused for a reason none of these tests is making.
 *
 * What Meta cannot do is reference a Space with no Map. A Space Resource names
 * a Map of its target (ADR 0079) and a mapless target offers none to
 * name, so `Other` goes unreferenced for exactly as long as it stays that way —
 * and the Edit under test is the one that initializes it *and* references it,
 * which is the only moment the whole aggregate is read.
 */
const meta = (target: SpaceSnapshot): SpaceSnapshot => {
  const toOther =
    target.document.defaultMap === undefined
      ? []
      : [
          {
            id: META_TO_OTHER_ID,
            document: {
              title: 'Other',
              kind: 'space',
              spaceId: OTHER_ID,
              map: OTHER_MAP_ID,
              graph: OTHER_GRAPH_ID,
            },
          },
        ];
  const resources = [
    { id: META_RESOURCE_ID, document: { title: 'Meta', kind: 'markdown', body: '' } },
    {
      id: META_TO_HOME_ID,
      document: {
        title: 'Home',
        kind: 'space',
        spaceId: HOME_ID,
        map: HOME_MAP_ID,
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
      maps: [
        {
          id: META_MAP_ID,
          title: 'Map 1',
          kind: 'positioned',
          positions: Object.fromEntries(
            resources.map((resource, index) => [
              resource.id,
              { x: index * 300, y: 0, open: false },
            ]),
          ),
          graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
        },
      ],
      defaultMap: META_MAP_ID,
    },
    resources,
  });
};

/** The Space the app opens, and the one every Space Resource below is created in. */
const home: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: HOME_ID,
  document: {
    version: 1,
    title: 'Home',
    maps: [
      {
        id: HOME_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [HOME_RESOURCE_ID]: { x: 10, y: 20, open: false },
          [HOME_NEXT_RESOURCE_ID]: { x: 310, y: 20, open: false },
        },
        // An Edge, so this Space can be presented: presenting is one of the
        // operations that closes the creation pane, and a Graph with no Edge
        // declines to start (ADR 0032).
        graphs: [
          {
            id: HOME_GRAPH_ID,
            title: 'Graph 1',
            edges: [{ from: HOME_RESOURCE_ID, to: HOME_NEXT_RESOURCE_ID }],
          },
        ],
      },
    ],
    defaultMap: HOME_MAP_ID,
  },
  resources: [
    { id: HOME_RESOURCE_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
    { id: HOME_NEXT_RESOURCE_ID, document: { title: 'And then', kind: 'markdown', body: '' } },
  ],
});

/**
 * The Space an author references instead of creating one: already initialized,
 * with two Maps to tell one Space Resource's selection from another's.
 */
const other: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: OTHER_ID,
  document: {
    version: 1,
    title: 'Other Space',
    maps: [
      {
        id: OTHER_MAP_ID,
        title: 'Collection 1',
        kind: 'positioned',
        positions: { [OTHER_RESOURCE_ID]: { x: 0, y: 0, open: false } },
        graphs: [
          { id: OTHER_DRAFT_GRAPH_ID, title: 'Draft', edges: [] },
          { id: OTHER_GRAPH_ID, title: 'Current', edges: [] },
        ],
        activeGraph: OTHER_GRAPH_ID,
      },
      {
        id: OTHER_SECOND_MAP_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: OTHER_SECOND_GRAPH_ID, title: 'Second pass', edges: [] }],
      },
    ],
    defaultMap: OTHER_MAP_ID,
  },
  resources: [
    { id: OTHER_RESOURCE_ID, document: { title: 'Resource 1', kind: 'markdown', body: '' } },
  ],
});

/**
 * The same Space as it is stored before anything has opened it: no Map at
 * all, which is the state ADR 0079's first working load exists to end.
 */
const maplessOther: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: OTHER_ID,
  document: { version: 1, title: 'Other Space' },
  resources: [
    { id: OTHER_RESOURCE_ID, document: { title: 'Resource 1', kind: 'markdown', body: '' } },
  ],
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
  resources: [
    ...other.resources,
    {
      id: OTHER_TO_HOME_ID,
      document: {
        title: 'Home',
        kind: 'space',
        spaceId: HOME_ID,
        map: HOME_MAP_ID,
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
  broken: Partial<SpaceResourceAuthoring> = {},
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
  const { spaceSession: session, spaceResources: authoring } = openTestSpace(
    backend,
    stored,
    newId,
  );
  const spaceResources: SpaceResourceAuthoring = { ...authoring, ...broken };
  const app = composeApp({ spaceSession: session, reportObserverError });
  let view: RenderResult | undefined;
  mountSpace(
    {
      id: runtime(home).id,
      session,
      app,
      spaceResources,
    },
    (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    },
  );
  return { backend, session, app };
}

const resourcesOf = (session: SpaceSession) => session.getState().working.resources;

/** The canvas node one Resource is drawn as, which is how a caret is placed by id. */
const nodeFor = (id: UUID): HTMLElement | null =>
  document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);

/** The Space Resources `Home` holds, in authored order. */
const spaceResourcesOf = (session: SpaceSession) =>
  resourcesOf(session).flatMap((resource) =>
    resource.document.kind === 'space' ? [{ id: resource.id, document: resource.document }] : [],
  );

/**
 * Persistence is asynchronous and a coordinated Edit writes several Spaces, so
 * a test that ends the moment it has asserted leaves the answer to land against
 * an unmounted tree.
 */
const settled = (session: SpaceSession): Promise<void> =>
  waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

/** Wait for the Resources to reach the canvas, which is what makes Resource authoring available. */
async function readyToAuthor(): Promise<void> {
  const create = await screen.findByRole('button', { name: 'Create Markdown Resource' });
  await waitFor(() => expect(unavailable(create)).toBe(false));
}

/**
 * Create a Space Resource the way an author does: one press of its own Dock
 * control, which completes the Edit (ADR 0089).
 *
 * Wrapped in `act` because the lifecycle is asynchronous: the press returns
 * before the coordination has installed anything, and the state it installs
 * arrives on a later tick.
 */
async function createSpaceResource(): Promise<void> {
  await readyToAuthor();
  await act(async () => {
    createResource('Space Resource');
    // The press returns before the coordination has installed anything, so the
    // hop is what lets that installation land inside `act`.
    await Promise.resolve();
  });
}

/**
 * Open the Resources list, which is where an *existing* Space is referenced from.
 *
 * Idempotent, because a Space row does not take itself away: the list stays open
 * across an add, so a second reference is one more press on a row rather than a
 * second disclosure — and pressing the trigger again would close it.
 */
async function openResourcesList(): Promise<HTMLElement> {
  const open = screen.queryByRole('dialog', { name: 'Resources' });
  if (open !== null) return open;
  fireEvent.click(screen.getByRole('button', { name: 'Resources' }));
  return await screen.findByRole('dialog', { name: 'Resources' });
}

/**
 * Reference a Space that already exists — the Resources list's add-Space row.
 *
 * The other half of what the retired creation pane did, and the half ADR 0089
 * keeps as a gesture of its own: making a Space and pointing at one that exists
 * are different acts, and this one lists real Spaces with search where the pane
 * offered a sentinel row beside them.
 */
async function addExistingSpace(title: string): Promise<void> {
  await readyToAuthor();
  await openResourcesList();
  const row = await screen.findByRole('button', { name: `Add ${title} to Map` });
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

describe('Create Space Resource', () => {
  it('numbers each new Space from the Space Resources already on the Map', async () => {
    const { session } = mount();
    await createSpaceResource();
    await settled(session);
    const editor = await screen.findByRole('textbox', { name: 'Resource title' });
    expect(editor).toHaveValue('Space 1');
    fireEvent.keyDown(editor, { key: 'Escape' });
    await createSpaceResource();
    await settled(session);
    expect(spaceResourcesOf(session).map((resource) => resource.document.title)).toEqual([
      'Space 1',
      'Space 2',
    ]);
  });

  /**
   * One press mints three entities — the Resource, the Space it names and that
   * Space's first Markdown Resource — and the first two take one `Space N`.
   *
   * `Space N` is numbered over the containing Space's own Resource titles, which is
   * the only source that can be read synchronously; the Space and the Resource get
   * the same string, so they agree at creation exactly as the retired pane's
   * typed title made them (ADR 0089). The target's first Resource is the neutral
   * `Resource 1` every new Space begins with, because content titled after the
   * Space it lives in only reads as deliberate until the first rename makes the
   * pair disagree (ADR 0068).
   */
  it('creates a Space Resource and the new Space it names from one Space N', async () => {
    const { backend, session } = mount();

    await createSpaceResource();

    await waitFor(() => expect(spaceResourcesOf(session)).toHaveLength(1));
    const created = spaceResourcesOf(session);
    expect(created[0]?.document.title).toBe('Space 1');

    const targetId = created[0]!.document.spaceId;
    const target = await backend.loadSpace(targetId);
    expect(target?.snapshot.document.title).toBe('Space 1');
    expect(target?.snapshot.resources.map((resource) => resource.document)).toEqual([
      { title: 'Resource 1', kind: 'markdown', body: '' },
    ]);
    await settled(session);
  });

  /**
   * **The caret lands in the Resource, before the commit settles.**
   *
   * This is the optimistic half of ADR 0089: the coordination installs its local
   * Edit and *then* commits two snapshots, and the press continues at the Resource
   * as soon as that installation lands rather than waiting for the durable
   * write. So the editor is open over a Resource whose Space is still being
   * written — which is the point, not an implementation detail.
   */
  it('continues in the created Resource’s own Title editor', async () => {
    const { session } = mount();

    await createSpaceResource();

    const editor = await screen.findByRole('textbox', { name: 'Resource title' });
    expect(editor).toHaveValue('Space 1');
    expect(editor).toHaveFocus();
    await settled(session);
  });

  it('withdraws Create Space Resource while its coordinated Edit is in flight', async () => {
    let resolveCreate!: (value: Awaited<ReturnType<SpaceResourceAuthoring['create']>>) => void;
    const createDeferred = new Promise<Awaited<ReturnType<SpaceResourceAuthoring['create']>>>(
      (resolve) => {
        resolveCreate = resolve;
      },
    );
    const create = vi.fn(() => createDeferred);
    const { session } = mount(other, { create }, vi.fn());

    await readyToAuthor();
    const spaceControl = createResourceControl('Space Resource');
    const markdownControl = createResourceControl('Markdown Resource');

    await act(async () => {
      createResource('Space Resource');
      await Promise.resolve();
    });

    expect(unavailable(spaceControl)).toBe(true);
    expect(unavailable(markdownControl)).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(spaceControl);
      await Promise.resolve();
    });
    expect(create).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({ kind: 'unchanged' });
      await createDeferred;
      await Promise.resolve();
    });

    await waitFor(() => expect(unavailable(spaceControl)).toBe(false));
    await settled(session);
  });

  /**
   * Create Space Resource is withdrawn for its own in-flight window, but Add
   * Markdown Resource is synchronous and stays available — so a Markdown Resource can
   * still land while the coordination is open. The lifecycle answers the Resource
   * this press made, so the continuation still lands on the Space Resource.
   */
  it('continues in its own Resource when a Markdown Resource lands in the same window', async () => {
    const { session } = mount();
    await readyToAuthor();

    await act(async () => {
      createResource('Space Resource');
      // Synchronous, and inside the window the coordination is still open for.
      createResource('Markdown Resource');
      await Promise.resolve();
    });

    await waitFor(() => expect(spaceResourcesOf(session)).toHaveLength(1));
    const spaceResource = spaceResourcesOf(session)[0]!;
    const markdown = resourcesOf(session).filter(
      (resource) =>
        resource.document.kind === 'markdown' &&
        !home.resources.some(({ id }) => id === resource.id),
    );
    expect(markdown).toHaveLength(1);

    const editor = await screen.findByRole('textbox', { name: 'Resource title' });
    expect(editor).toHaveValue('Space 1');
    expect(nodeFor(spaceResource.id)).toContainElement(editor);
    expect(markdown[0]?.document.title).toBe('Resource 1');
    await settled(session);
  });

  /**
   * The seeding is a convenience at creation and never a link afterwards: the
   * Resource and the Space it names are separate entities from the moment they
   * exist, and the Resource's Title is the containing Space's to author.
   */
  it('leaves the target Space’s title alone when the Resource is renamed', async () => {
    const { backend, session } = mount();
    await createSpaceResource();
    await waitFor(() => expect(spaceResourcesOf(session)).toHaveLength(1));
    const targetId = spaceResourcesOf(session)[0]!.document.spaceId;

    const editor = await screen.findByRole('textbox', { name: 'Resource title' });
    fireEvent.change(editor, { target: { value: 'The architecture' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    await waitFor(() =>
      expect(spaceResourcesOf(session)[0]?.document.title).toBe('The architecture'),
    );
    await waitFor(async () =>
      expect((await backend.loadSpace(targetId))?.snapshot.document.title).toBe('Space 1'),
    );
    await settled(session);
  });

  /**
   * A refused creation leaves nothing standing, and says what died.
   *
   * The lifecycle answers its refusal as it installs, so a refusal arrives with
   * no Resource ever drawn — which is what "removed on refusal" amounts to from
   * out here. What the author needs is the sentence, because the gesture they
   * made looked exactly like the one that works, and the Dock's refusal channel
   * is where a creation with no pane of its own reports (ADR 0089).
   */
  it('creates nothing and names the Space when the lifecycle refuses', async () => {
    const { session } = mount(other, {
      create: () =>
        Promise.resolve({ kind: 'refused', refusal: { code: 'persistence-read-failed' } }),
    });

    await createSpaceResource();

    expect(await screen.findByText('Space not created')).toBeVisible();
    expect(spaceResourcesOf(session)).toEqual([]);
    expect(resourcesOf(session)).toEqual(home.resources);
    expect(screen.queryByRole('textbox', { name: 'Resource title' })).toBeNull();
    await settled(session);
  });

  it.each(['refused', 'rejected'] as const)(
    'allows another attempt after a %s creation',
    async (outcome) => {
      const create = vi
        .fn<SpaceResourceAuthoring['create']>()
        .mockImplementationOnce(() =>
          outcome === 'refused'
            ? Promise.resolve({ kind: 'refused', refusal: { code: 'persistence-read-failed' } })
            : Promise.reject(new Error('coordination failed')),
        )
        .mockResolvedValue({ kind: 'unchanged' });
      const { session } = mount(other, { create }, vi.fn());
      await createSpaceResource();
      expect(await screen.findByText('Space not created')).toBeVisible();
      await createSpaceResource();
      expect(create).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Space not created')).toBeNull();
      await settled(session);
    },
  );

  /**
   * A lifecycle that changed nothing did not create a Resource.
   *
   * `SpaceResourceCreationResult` has three arms and only `refused` says something
   * is wrong, so an `unchanged` answered as a creation would open a Title editor
   * over a Resource that was never made. Named the way the other arms are, so the
   * compiler asks again the day a fourth joins the union.
   */
  it('creates nothing and reports nothing when the lifecycle answers unchanged', async () => {
    const create = vi.fn<SpaceResourceAuthoring['create']>(() =>
      Promise.resolve({ kind: 'unchanged' }),
    );
    const { session } = mount(other, { create });

    await createSpaceResource();

    expect(create).toHaveBeenCalledTimes(1);
    expect(spaceResourcesOf(session)).toHaveLength(0);
    expect(screen.queryByText('Space not created')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Resource title' })).toBeNull();
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

    await createSpaceResource();

    expect(
      await screen.findByText('This Resource was not created: the coordination lost a session'),
    ).toBeVisible();
    expect(spaceResourcesOf(session)).toEqual([]);
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

    await createSpaceResource();

    expect(
      await screen.findByText('This Resource was not created: the coordination lost a session'),
    ).toBeVisible();
    expect(reported).toHaveBeenCalled();
    await settled(session);
  });
});

/**
 * Referencing a Space that already exists, which is a different act.
 *
 * ADR 0089 splits the retired pane's two halves: Create Space Resource always makes
 * a Space, and pointing at one that exists is the Resources list's add-Space row —
 * a list of real Spaces with search, where the pane offered a sentinel row
 * beside them. Everything the lifecycle's `link` arm answers is proved here,
 * through that row.
 */
describe('referencing an existing Space', () => {
  /**
   * Referencing is not copying. The same Resource shape reaches an existing Space,
   * so what tells the two paths apart is the Space count either side of the
   * Edit — one more for a creation, unchanged for a reference.
   */
  it('references an existing Space instead of creating a second one', async () => {
    const { backend, session } = mount();

    await addExistingSpace('Other Space');

    await waitFor(() =>
      expect(spaceResourcesOf(session).map((resource) => resource.document)).toEqual([
        {
          title: 'Other Space',
          kind: 'space',
          spaceId: OTHER_ID,
          map: OTHER_MAP_ID,
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
   * What the Resource records is the Map that Space itself opens on and that
   * Map's own Active Graph (ADR 0079, ADR 0026) — `Current` and not `Draft`,
   * which is the only distinction `Collection 1`'s two Graphs are here to expose.
   * The target's stored document is asserted whole, because initialization is a
   * commit and a commit that ran against a Space needing nothing would show up
   * nowhere else.
   */
  it('takes an initialized target’s opening selection and initializes nothing', async () => {
    const { backend, session } = mount();

    await addExistingSpace('Other Space');

    await waitFor(() => expect(spaceResourcesOf(session)).toHaveLength(1));
    expect(spaceResourcesOf(session)[0]?.document).toMatchObject({
      map: OTHER_MAP_ID,
      graph: OTHER_GRAPH_ID,
    });
    const stored = await backend.loadSpace(OTHER_ID);
    expect(stored?.snapshot.document).toEqual(other.document);
    await settled(session);
  });

  /**
   * A mapless target is initialized before the Resource that shows it exists.
   *
   * A Space Resource names a Map of its target and a Graph that Map owns
   * (ADR 0079), so a Space with neither offers nothing to name. The lifecycle
   * makes the target working first — the durable initialization ADR 0079 gives
   * first working load — and stores exactly what that minted. Both halves are
   * asserted because either alone would pass against a Resource carrying two ids
   * the stored Space had never heard of.
   */
  it('initializes a mapless target and stores what initialization minted', async () => {
    const { backend, session } = mount(maplessOther, {}, undefined, {
      newId: mintingIds(MINTED_MAP_ID, MINTED_GRAPH_ID, MINTED_RESOURCE_ID),
    });

    await addExistingSpace('Other Space');

    await waitFor(() => expect(spaceResourcesOf(session)).toHaveLength(1));
    expect(spaceResourcesOf(session)[0]).toEqual({
      id: MINTED_RESOURCE_ID,
      document: {
        title: 'Other Space',
        kind: 'space',
        spaceId: OTHER_ID,
        map: MINTED_MAP_ID,
        graph: MINTED_GRAPH_ID,
      },
    });
    const stored = await backend.loadSpace(OTHER_ID);
    expect(stored?.snapshot.document.defaultMap).toBe(MINTED_MAP_ID);
    expect(stored?.snapshot.document.maps).toEqual([
      {
        id: MINTED_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: MINTED_GRAPH_ID, title: 'Graph 1', edges: [] }],
        activeGraph: MINTED_GRAPH_ID,
      },
    ]);
    // Initialized, not replaced: the Resource the Space already held is untouched.
    expect(stored?.snapshot.resources).toEqual(maplessOther.resources);
    expect(await backend.listSpaces()).toHaveLength(3);
    await settled(session);
  });

  /**
   * A target that could not be prepared makes nothing at all, and says so on
   * the list that asked.
   *
   * Initialization is its own durable commit and it runs before the Edit
   * (ADR 0079), so a commit that fails leaves no Resource, no half-written
   * selection and a containing Space nobody touched. The sentence is the
   * `not-initialized` one, and asserting it whole is what separates this from a
   * Space that has gone: a failed commit is the transient arm, so it is the only
   * one that tells the author to try again.
   */
  it('creates nothing and says so when its target could not be prepared', async () => {
    const control = new MemorySpaceBackendTestControl();
    const { backend, session } = mount(maplessOther, {}, undefined, { control });
    await readyToAuthor();
    await openResourcesList();
    const before = resourcesOf(session);

    // Queued here rather than at mount so it is spent by the initialization
    // commit and not by whatever the opening of `Home` might have written.
    control.queueResult({
      kind: 'permanent-failure',
      code: 'invalid-commit',
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Add Other Space to Map' }));
    });

    expect(
      await screen.findByText(
        'That Space could not be prepared to be shown here, so nothing was created. Try again.',
      ),
    ).toBeVisible();
    expect(spaceResourcesOf(session)).toEqual([]);
    expect(resourcesOf(session)).toEqual(before);
    expect((await backend.loadSpace(OTHER_ID))?.snapshot.document.maps).toBeUndefined();
    await settled(session);
  });

  /**
   * Convergence is legal: a Space is reachable by however many references point
   * at it, and each is an ordinary Resource with its own Title (ADR 0074). Nothing
   * about the second reference is a second Space.
   */
  it('lets two Space Resources reference one Space', async () => {
    const { backend, session } = mount();

    await addExistingSpace('Other Space');
    await waitFor(() => expect(spaceResourcesOf(session)).toHaveLength(1));
    await settled(session);

    await addExistingSpace('Other Space');
    await waitFor(() => expect(spaceResourcesOf(session)).toHaveLength(2));

    expect(spaceResourcesOf(session).map((resource) => resource.document.spaceId)).toEqual([
      OTHER_ID,
      OTHER_ID,
    ]);
    // Both begin at what the Space itself opens on, because the selection is
    // read off the target rather than proposed by the author (ADR 0079).
    expect(spaceResourcesOf(session).map(({ document }) => [document.map, document.graph])).toEqual(
      [
        [OTHER_MAP_ID, OTHER_GRAPH_ID],
        [OTHER_MAP_ID, OTHER_GRAPH_ID],
      ],
    );
    expect(await backend.listSpaces()).toHaveLength(3);
    await settled(session);
  });

  /**
   * Two references to one Space are two selections, and neither is the other's.
   *
   * This is the behaviour that requiring the pair buys over deriving it. While
   * a Space Resource with nothing stored read its Map through the target's own
   * `defaultMap`, two Resources on one Space could only ever show the same
   * Map — so one Resource showing `Collection 1` beside another showing
   * `Collection 2` was not expressible at all.
   *
   * The selection is changed through the on-canvas selector, which is the only
   * surface that changes one: neither creation gesture offers a choice, because
   * a caller holding a listing row has no Map of the target to offer
   * (ADR 0068). And it is read back off the *stored* Space as well as the
   * session, since a selection that lived only in working state would be a view
   * preference rather than authored content.
   */
  it('keeps a selection per Space Resource, and stores both', async () => {
    const { backend, session } = mount();

    await addExistingSpace('Other Space');
    await waitFor(() => expect(spaceResourcesOf(session)).toHaveLength(1));
    await settled(session);

    await addExistingSpace('Other Space');
    await waitFor(() => expect(spaceResourcesOf(session)).toHaveLength(2));
    await settled(session);

    // Both Resources carry the target's own name, because a Space stays offered
    // however many Resources frame it and each row seeds its Resource from the Space
    // it names. So the first is found **by its id** rather than by its name or
    // by document order: two nodes answer that name, and React Flow orders its
    // nodes by draw order rather than by authored order — `findAllByRole(…)[0]`
    // passed against whichever it happened to draw first.
    const [authoredFirst] = spaceResourcesOf(session);
    if (authoredFirst === undefined) throw new Error('The first Space Resource was not authored');
    const node = document.querySelector(`.react-flow__node[data-id="${authoredFirst.id}"]`);
    if (!(node instanceof HTMLElement))
      throw new Error('The first Space Resource is not on canvas');
    fireEvent.click(within(node).getByRole('button', { name: 'Open Resource Other Space' }));
    const rail = await waitFor(() => {
      const found = document.querySelector(`[data-resource-rail-for="${authoredFirst.id}"]`);
      if (!(found instanceof HTMLElement))
        throw new Error('The first Space Resource rail is not drawn');
      return found;
    });
    fireEvent.click(within(rail).getByTestId('space-resource-map'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Collection 2' }));

    await waitFor(() =>
      expect(
        spaceResourcesOf(session).map(({ document }) => [document.map, document.graph]),
      ).toEqual([
        [OTHER_SECOND_MAP_ID, OTHER_SECOND_GRAPH_ID],
        [OTHER_MAP_ID, OTHER_GRAPH_ID],
      ]),
    );
    await settled(session);

    const stored = await backend.loadSpace(HOME_ID);
    const storedSpaceResources = (stored?.snapshot.resources ?? []).flatMap((resource) =>
      resource.document.kind === 'space' ? [{ id: resource.id, document: resource.document }] : [],
    );
    // The backend answers Resources in ascending id order (ticket 30), which need
    // not match Space Authoring's own authored order, so the two sides are
    // matched by id rather than by position before comparing what landed. The
    // ids stay in the comparison: dropping them would pass just as happily on a
    // document that landed on the wrong Resource.
    const ascendingById = <T extends { id: UUID }>(entries: readonly T[]): T[] =>
      [...entries].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    expect(ascendingById(storedSpaceResources)).toEqual(ascendingById(spaceResourcesOf(session)));
  });

  /**
   * A cycle is refused by the aggregate rather than filtered out of the list,
   * and the refusal is the better answer: it names the Resources that formed the
   * loop, where a silently shorter list would have said nothing at all.
   */
  it('refuses a choice that would make a Space contain itself', async () => {
    const { session } = mount(otherReferencingHome);

    await addExistingSpace('Other Space');

    expect(
      await screen.findByText('A space resource would make a space contain itself.'),
    ).toBeVisible();
    expect(spaceResourcesOf(session)).toEqual([]);
    await settled(session);
  });
});

/**
 * **A Space dropped from the list answers exactly as a pressed one does.**
 *
 * `ResourcesPopover.test.tsx` holds the list's half and `SpaceCanvas.test.tsx`
 * the pane's; this is `App` joining them, which neither mounts. A drop whose
 * answer `App` never settled would pass both and leave the row having visibly
 * done nothing.
 */
describe('dropping an existing Space onto the canvas', () => {
  it('shows a broken drop on the list it left, and reports the break', async () => {
    const reported = vi.fn();
    const { session } = mount(
      other,
      { link: () => Promise.reject(new Error('the coordination lost a session')) },
      reported,
    );
    await readyToAuthor();
    const list = await openResourcesList();
    const carried = new Map<string, string>();
    const types: string[] = [];
    const dataTransfer = {
      types,
      dropEffect: 'none',
      effectAllowed: 'none',
      setData: (type: string, value: string) => {
        carried.set(type, value);
        types.push(type);
      },
      getData: (type: string) => carried.get(type) ?? '',
    };

    fireEvent.dragStart(within(list).getByRole('button', { name: 'Add Other Space to Map' }), {
      dataTransfer,
    });
    const pane = document.querySelector<HTMLElement>('.react-flow__pane');
    if (pane === null) throw new Error('No pane is drawn.');
    await act(async () => {
      fireEvent.drop(pane, { dataTransfer });
      await Promise.resolve();
    });

    const alert = await within(list).findByRole('alert');
    expect(alert).toHaveTextContent('Resource not added');
    expect(alert).toHaveTextContent(
      'This Space Resource was not added: the coordination lost a session',
    );
    expect(reported).toHaveBeenCalled();
    expect(spaceResourcesOf(session)).toEqual([]);
    await settled(session);
  });
});
