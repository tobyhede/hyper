import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  spaceSnapshotSchema,
  uuidSchema,
  type ResourceDocument,
  type SpaceSnapshot,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, type SpaceSession } from '@project/persistence';
import { mountSpace } from './space-mounting';
import { composeApp } from '../src/compose-app';
import { openTestSpace } from './opened-space';

/**
 * The two selections an Open Space Resource authors.
 *
 * A Space Resource's content is the Map it selects of the Space it
 * references (ADR 0068), so Opening it is what exposes the only two properties
 * about it an author can change — and the target reference is deliberately not
 * one of them: it is chosen once, at creation, and no control on the Open Resource
 * reaches it.
 *
 * The pairing is the point of these tests rather than either control on its
 * own: a Graph is owned by the Map that holds it (ADR 0040), so the Graphs
 * on offer are the selected Map's and choosing a Map re-seeds the Graph
 * from it. The alternative — leaving the previous Map's Graph in place — is
 * a Resource the aggregate refuses, so the re-seed is a domain rule and not a
 * courtesy.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_TO_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const HOME_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const HOME_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const HOME_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const TARGET_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const FIRST_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const FIRST_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const SECOND_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const THIRD_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const THIRD_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000027');
const FOURTH_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000028');
const FIFTH_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000029');

/**
 * The Space this Resource references: two Maps, and the first owning two Graphs.
 *
 * Two of each is the smallest fixture that can tell the two selectors apart —
 * one Map would make every Graph list the same list, and one Graph per
 * Map would make the re-seed indistinguishable from leaving the selection
 * alone.
 */
const target: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    maps: [
      {
        id: FIRST_MAP_ID,
        title: 'Collection 1',
        kind: 'positioned',
        positions: { [TARGET_RESOURCE_ID]: { x: 0, y: 0, open: false } },
        graphs: [
          { id: FIRST_GRAPH_ID, title: 'Overview', edges: [] },
          { id: SECOND_GRAPH_ID, title: 'Detail', edges: [] },
        ],
      },
      {
        id: SECOND_MAP_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: { [TARGET_RESOURCE_ID]: { x: 200, y: 0, open: false } },
        graphs: [{ id: THIRD_GRAPH_ID, title: 'Second pass', edges: [] }],
      },
      // The one Map that has authored an Active Graph, and deliberately not
      // its first: a seed taken from the head of the list agrees with an
      // authored `activeGraph` everywhere else, so nothing but this Map can
      // tell the two rules apart.
      {
        id: THIRD_MAP_ID,
        title: 'Collection 3',
        kind: 'positioned',
        positions: { [TARGET_RESOURCE_ID]: { x: 400, y: 0, open: false } },
        graphs: [
          { id: FOURTH_GRAPH_ID, title: 'Draft', edges: [] },
          { id: FIFTH_GRAPH_ID, title: 'Current', edges: [] },
        ],
        activeGraph: FIFTH_GRAPH_ID,
      },
    ],
    defaultMap: FIRST_MAP_ID,
  },
  resources: [
    { id: TARGET_RESOURCE_ID, document: { title: 'Resource 1', kind: 'markdown', body: '' } },
  ],
});

/**
 * The Space the app opens, holding one Space Resource that points at the target.
 *
 * The document is the schema-derived one rather than a loose record, so a test
 * that seeds a selection is writing the same shape authoring writes — and one
 * that seeds a *stale* selection has to say so with real ids rather than with a
 * value the type would not have allowed.
 */
const home = (spaceResource: Extract<ResourceDocument, { kind: 'space' }>): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
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
            [SPACE_RESOURCE_ID]: { x: 600, y: 20, open: false },
          },
          graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
        },
      ],
      defaultMap: HOME_MAP_ID,
    },
    resources: [
      { id: HOME_RESOURCE_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
      { id: SPACE_RESOURCE_ID, document: spaceResource },
    ],
  });

/**
 * The Space Resource as created: the Map its target opens on, and that Map's
 * Active Graph (ADR 0079).
 *
 * There is no Space Resource here carrying nothing, because the lifecycle that
 * creates one stores what its target opens on before the Resource exists. So what
 * these tests exercise is a selection being *changed*, and the baseline they
 * change from is the one the author would actually have been handed.
 */
const created = home({
  title: 'Elsewhere',
  kind: 'space',
  spaceId: TARGET_ID,
  map: FIRST_MAP_ID,
  graph: FIRST_GRAPH_ID,
});

/**
 * Meta, which is here because the aggregate demands a sole root that reaches
 * every ordinary Space (ADR 0074) rather than because these tests are about it.
 */
const meta: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    maps: [
      {
        id: META_MAP_ID,
        title: 'Map 1',
        kind: 'positioned',
        positions: {
          [META_RESOURCE_ID]: { x: 0, y: 0, open: false },
          [META_TO_HOME_ID]: { x: 300, y: 0, open: false },
          [META_TO_TARGET_ID]: { x: 600, y: 0, open: false },
        },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultMap: META_MAP_ID,
  },
  resources: [
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
    {
      id: META_TO_TARGET_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        map: FIRST_MAP_ID,
        graph: FIRST_GRAPH_ID,
      },
    },
  ],
});

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

/** Mount the app on one exact `Home` snapshot, with Meta and the target beside it. */
function mount(value: SpaceSnapshot = created): SpaceSession {
  const backend = new MemorySpaceBackend(META_ID, [
    { snapshot: meta, revision: 0n, exportedRevision: null },
    { snapshot: value, revision: 0n, exportedRevision: null },
    { snapshot: target, revision: 0n, exportedRevision: null },
  ]);
  const stored = { snapshot: value, revision: 0n, exportedRevision: null };
  const { spaceSession: session, spaceResources } = openTestSpace(backend, stored);
  let view: RenderResult | undefined;
  mountSpace(
    {
      id: runtime(value).id,
      session,
      app: composeApp({ spaceSession: session }),
      spaceResources,
    },
    (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    },
  );
  return session;
}

/** What the Space Resource records, which is where a selection is authored. */
const spaceResourceDocument = (session: SpaceSession) =>
  session.getState().working.resources.find((resource) => resource.id === SPACE_RESOURCE_ID)
    ?.document;

const settled = (session: SpaceSession): Promise<void> =>
  waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

/**
 * Reach the Space Resource Open, and wait for its selectors.
 *
 * Both waits are real: the Resource reaches the canvas with the asynchronous
 * placement, and its target is a *second* Space, read asynchronously after the
 * Resource is already drawn — until that read lands the Open Resource draws its waiting
 * note in place of the two controls.
 *
 * Open is authored on the Map (ADR 0064), so a snapshot may already carry
 * it: the reopening test mounts one that does, and pressing Open there would
 * close the Resource this helper is asked to open.
 */
async function openSpaceEndpoint(): Promise<HTMLElement> {
  const control = await screen.findByRole('button', { name: /^(Open|Close) Resource Elsewhere$/ });
  if (control.getAttribute('aria-label') === 'Open Resource Elsewhere') fireEvent.click(control);
  await screen.findByTestId('space-resource-map');
  const rail = document.querySelector(`[data-resource-rail-for="${SPACE_RESOURCE_ID}"]`);
  if (!(rail instanceof HTMLElement)) throw new Error('the Space Resource rail is not drawn');
  return rail;
}

/**
 * Choose one row of a Space Resource selector.
 *
 * The shared `ChoiceMenu` the Command Dock's Map and Graph lists are: a menu
 * of radio rows behind the control that names what is chosen. Reached the same
 * way `packages/app/test/command-dock.ts` reaches the Dock's — press the
 * trigger, press the row.
 */
function choose(testId: string, name: string): void {
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.click(screen.getByRole('menuitemradio', { name }));
}

/** The rail offers the entity menu and two context choices, with no target picker. */
function railMenuControls(resource: HTMLElement): HTMLElement[] {
  return within(within(resource).getByRole('toolbar'))
    .getAllByRole('button')
    .filter((control) => control.getAttribute('aria-haspopup') === 'menu');
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

describe('an Open Space Resource', () => {
  /**
   * Opening is what adds the two controls that say *which part* of the target
   * Space this Resource shows.
   */
  it('draws both of its selectors', async () => {
    const session = mount();

    const resource = await openSpaceEndpoint();

    // Both are live from the first render, and both name what they hold. A
    // Space Resource selects a Map and a Graph from the moment it exists (ADR
    // 0079), so the Graph control always has a Map to draw its rows from,
    // and neither control has a `none` to say.
    expect(within(resource).getByRole('button', { name: 'Map: Collection 1' })).toBeEnabled();
    expect(within(resource).getByRole('button', { name: 'Graph: Overview' })).toBeEnabled();
    await settled(session);
  });

  /**
   * One Edit writes both keys, because they are not independent: a Graph is
   * owned by its Map, so a Map chosen without re-seeding the Graph names
   * a Graph the new Map does not own, and the aggregate refuses exactly
   * that (ADR 0040, ADR 0068).
   */
  it('writes the chosen Map and re-seeds the Graph from it', async () => {
    const session = mount();
    await openSpaceEndpoint();

    choose('space-resource-map', 'Collection 2');

    await waitFor(() =>
      expect(spaceResourceDocument(session)).toEqual({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        map: SECOND_MAP_ID,
        graph: THIRD_GRAPH_ID,
      }),
    );
    await settled(session);
  });

  /**
   * The seed is the Map's own Active Graph where it has one.
   *
   * A Map answers "which Graph is current here" itself (ADR 0026), and a
   * Space Resource that showed a different one would be disagreeing with the Map
   * it had just been pointed at. The head of the list is the fallback rather
   * than the rule — which is what ADR 0026 says an absent `activeGraph` means.
   */
  it('seeds the Graph from the chosen Map’s Active Graph', async () => {
    const session = mount();
    await openSpaceEndpoint();

    choose('space-resource-map', 'Collection 3');

    await waitFor(() =>
      expect(spaceResourceDocument(session)).toMatchObject({
        map: THIRD_MAP_ID,
        graph: FIFTH_GRAPH_ID,
      }),
    );
    await settled(session);
  });

  it('writes a Graph chosen from the Map already selected', async () => {
    const session = mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        map: FIRST_MAP_ID,
        graph: FIRST_GRAPH_ID,
      }),
    );
    await openSpaceEndpoint();

    choose('space-resource-graph', 'Detail');

    await waitFor(() =>
      expect(spaceResourceDocument(session)).toMatchObject({
        map: FIRST_MAP_ID,
        graph: SECOND_GRAPH_ID,
      }),
    );
    await settled(session);
  });

  /**
   * A selection is authored state and not a view preference, so it has to
   * survive the snapshot it was written into being reopened. Asserting the
   * session alone would not say that: the same two ids have to come back as the
   * *selected* rows of a freshly composed app, which is the only evidence that
   * proves the Resource reads its own stored selection rather than defaulting.
   */
  it('keeps both selections in the snapshot, and shows them selected on reopening', async () => {
    const session = mount();
    await openSpaceEndpoint();
    choose('space-resource-map', 'Collection 2');
    await waitFor(() =>
      expect(spaceResourceDocument(session)).toMatchObject({
        map: SECOND_MAP_ID,
        graph: THIRD_GRAPH_ID,
      }),
    );
    await settled(session);
    const written = session.getState().working;
    cleanup();

    const reopened = mount(written);

    const resource = await openSpaceEndpoint();
    expect(within(resource).getByTestId('space-resource-map')).toHaveTextContent('Collection 2');
    expect(within(resource).getByTestId('space-resource-graph')).toHaveTextContent('Second pass');
    await settled(reopened);
  });

  /**
   * The target is chosen once, at creation, and Space Authoring refuses a
   * changed one on its own account (ADR 0068) — so there is nothing on the Open
   * Resource that would even ask. The rail offers entity actions and the two context choices alone.
   */
  it('offers no way to change the Space it references', async () => {
    const session = mount();

    const resource = await openSpaceEndpoint();

    // Entity actions plus Map and Graph; no fourth menu for retargeting.
    expect(railMenuControls(resource)).toHaveLength(3);
    expect(within(resource).getByRole('button', { name: 'Map: Collection 1' })).toBeInTheDocument();
    expect(within(resource).getByRole('button', { name: 'Graph: Overview' })).toBeInTheDocument();
    await settled(session);
  });
});
