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
  type ThingDocument,
  type SpaceSnapshot,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, type SpaceSession } from '@project/persistence';
import { mountSpace } from './space-mounting';
import { composeApp } from '../src/compose-app';
import { openTestSpace } from './opened-space';
import { createThing } from './command-dock';

/**
 * The two selections an Open Space Thing authors.
 *
 * A Space Thing's content is the Diagram it selects of the Space it
 * references (ADR 0068), so Opening it is what exposes the only two things
 * about it an author can change — and the target reference is deliberately not
 * one of them: it is chosen once, at creation, and no control on the Open Thing
 * reaches it.
 *
 * The pairing is the point of these tests rather than either control on its
 * own: a Graph is owned by the Diagram that holds it (ADR 0040), so the Graphs
 * on offer are the selected Diagram's and choosing a Diagram re-seeds the Graph
 * from it. The alternative — leaving the previous Diagram's Graph in place — is
 * a Thing the aggregate refuses, so the re-seed is a domain rule and not a
 * courtesy.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_TO_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const HOME_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const HOME_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const HOME_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const TARGET_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const FIRST_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const FIRST_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const SECOND_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const THIRD_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const THIRD_DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000027');
const FOURTH_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000028');
const FIFTH_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000029');

/**
 * The Space this Thing references: two Diagrams, and the first owning two Graphs.
 *
 * Two of each is the smallest fixture that can tell the two selectors apart —
 * one Diagram would make every Graph list the same list, and one Graph per
 * Diagram would make the re-seed indistinguishable from leaving the selection
 * alone.
 */
const target: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    diagrams: [
      {
        id: FIRST_DIAGRAM_ID,
        title: 'Collection 1',
        kind: 'positioned',
        positions: { [TARGET_THING_ID]: { x: 0, y: 0, open: false } },
        graphs: [
          { id: FIRST_GRAPH_ID, title: 'Overview', edges: [] },
          { id: SECOND_GRAPH_ID, title: 'Detail', edges: [] },
        ],
      },
      {
        id: SECOND_DIAGRAM_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: { [TARGET_THING_ID]: { x: 200, y: 0, open: false } },
        graphs: [{ id: THIRD_GRAPH_ID, title: 'Second pass', edges: [] }],
      },
      // The one Diagram that has authored an Active Graph, and deliberately not
      // its first: a seed taken from the head of the list agrees with an
      // authored `activeGraph` everywhere else, so nothing but this Diagram can
      // tell the two rules apart.
      {
        id: THIRD_DIAGRAM_ID,
        title: 'Collection 3',
        kind: 'positioned',
        positions: { [TARGET_THING_ID]: { x: 400, y: 0, open: false } },
        graphs: [
          { id: FOURTH_GRAPH_ID, title: 'Draft', edges: [] },
          { id: FIFTH_GRAPH_ID, title: 'Current', edges: [] },
        ],
        activeGraph: FIFTH_GRAPH_ID,
      },
    ],
    defaultDiagram: FIRST_DIAGRAM_ID,
  },
  things: [{ id: TARGET_THING_ID, document: { title: 'Thing 1', kind: 'markdown', body: '' } }],
});

/**
 * The Space the app opens, holding one Space Thing that points at the target.
 *
 * The document is the schema-derived one rather than a loose record, so a test
 * that seeds a selection is writing the same shape authoring writes — and one
 * that seeds a *stale* selection has to say so with real ids rather than with a
 * value the type would not have allowed.
 */
const home = (spaceThing: Extract<ThingDocument, { kind: 'space' }>): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
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
            [SPACE_THING_ID]: { x: 600, y: 20, open: false },
          },
          graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
        },
      ],
      defaultDiagram: HOME_DIAGRAM_ID,
    },
    things: [
      { id: HOME_THING_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
      { id: SPACE_THING_ID, document: spaceThing },
    ],
  });

/**
 * The Space Thing as created: the Diagram its target opens on, and that Diagram's
 * Active Graph (ADR 0079).
 *
 * There is no Space Thing here carrying nothing, because the lifecycle that
 * creates one stores what its target opens on before the Thing exists. So what
 * these tests exercise is a selection being *changed*, and the baseline they
 * change from is the one the author would actually have been handed.
 */
const created = home({
  title: 'Elsewhere',
  kind: 'space',
  spaceId: TARGET_ID,
  diagram: FIRST_DIAGRAM_ID,
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
    diagrams: [
      {
        id: META_DIAGRAM_ID,
        title: 'Diagram 1',
        kind: 'positioned',
        positions: {
          [META_THING_ID]: { x: 0, y: 0, open: false },
          [META_TO_HOME_ID]: { x: 300, y: 0, open: false },
          [META_TO_TARGET_ID]: { x: 600, y: 0, open: false },
        },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultDiagram: META_DIAGRAM_ID,
  },
  things: [
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
    {
      id: META_TO_TARGET_ID,
      document: {
        title: 'Architecture',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: FIRST_DIAGRAM_ID,
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
  const { spaceSession: session, spaceThings } = openTestSpace(backend, stored);
  let view: RenderResult | undefined;
  mountSpace(
    {
      id: runtime(value).id,
      session,
      app: composeApp({ spaceSession: session }),
      spaceThings,
    },
    (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    },
  );
  return session;
}

/** What the Space Thing records, which is where a selection is authored. */
const spaceThingDocument = (session: SpaceSession) =>
  session.getState().working.things.find((thing) => thing.id === SPACE_THING_ID)?.document;

const settled = (session: SpaceSession): Promise<void> =>
  waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

/**
 * Reach the Space Thing Open, and wait for its selectors.
 *
 * Both waits are real: the Thing reaches the canvas with the asynchronous
 * placement, and its target is a *second* Space, read asynchronously after the
 * Thing is already drawn — until that read lands the Open Thing draws its waiting
 * note in place of the two controls.
 *
 * Open is authored on the Diagram (ADR 0064), so a snapshot may already carry
 * it: the reopening test mounts one that does, and pressing Open there would
 * close the Thing this helper is asked to open.
 */
async function openSpaceThing(): Promise<HTMLElement> {
  const control = await screen.findByRole('button', { name: /^(Open|Close) Thing Elsewhere$/ });
  if (control.getAttribute('aria-label') === 'Open Thing Elsewhere') fireEvent.click(control);
  await screen.findByTestId('space-thing-diagram');
  const node = document.querySelector(`.react-flow__node[data-id="${SPACE_THING_ID}"]`);
  if (!(node instanceof HTMLElement)) throw new Error('the Space Thing is not drawn as a node');
  return node;
}

/**
 * Choose one row of a Space Thing selector.
 *
 * The shared `ChoiceMenu` the Command Dock's Diagram and Graph lists are: a menu
 * of radio rows behind the control that names what is chosen. Reached the same
 * way `packages/app/test/command-dock.ts` reaches the Dock's — press the
 * trigger, press the row.
 */
function choose(testId: string, name: string): void {
  fireEvent.click(screen.getByTestId(testId));
  fireEvent.click(screen.getByRole('menuitemradio', { name }));
}

/**
 * The two controls an Open Space Thing publishes its choices through, and nothing
 * else.
 *
 * Addressed through the shared command surface they sit on rather than by role
 * over the whole Thing: the Thing's rail carries a menu trigger of its own (its
 * entity actions), so a count of menu buttons on the Thing would not be a count
 * of its choices.
 */
function choiceControls(thing: HTMLElement): HTMLElement[] {
  const surface = thing.querySelector('[data-slot="command-surface"]');
  if (!(surface instanceof HTMLElement)) throw new Error('the Space Thing draws no choice surface');
  return within(surface).getAllByRole('button');
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

describe('an Open Space Thing', () => {
  /**
   * Opening is what adds the two controls that say *which part* of the target
   * Space this Thing shows.
   */
  it('draws both of its selectors', async () => {
    const session = mount();

    const thing = await openSpaceThing();

    // Both are live from the first render, and both name what they hold. A
    // Space Thing selects a Diagram and a Graph from the moment it exists (ADR
    // 0079), so the Graph control always has a Diagram to draw its rows from,
    // and neither control has a `none` to say.
    expect(within(thing).getByRole('button', { name: 'Diagram: Collection 1' })).toBeEnabled();
    expect(within(thing).getByRole('button', { name: 'Graph: Overview' })).toBeEnabled();
    await settled(session);
  });

  /**
   * One Edit writes both keys, because they are not independent: a Graph is
   * owned by its Diagram, so a Diagram chosen without re-seeding the Graph names
   * a Graph the new Diagram does not own, and the aggregate refuses exactly
   * that (ADR 0040, ADR 0068).
   */
  /**
   * The waiting note means one thing: the target Space has not been read yet.
   *
   * Authoring is withdrawn from the whole canvas while a creation pane is up —
   * one authoring surface at a time — and the selectors go with it. What must
   * not go with it is the *answer*: a Thing that has read its target and is
   * drawing two controls over it cannot also be claiming it is still reading
   * it. Unavailable and unknown are different states and the author can act on
   * only one of them.
   */
  it('shows its selections unavailable rather than unread while a pane holds the canvas', async () => {
    const session = mount();
    const thing = await openSpaceThing();

    createThing('Space Thing');
    await screen.findByTestId('new-space-thing');

    // By test id rather than by role: the pane is modal, so Base UI has marked
    // the whole canvas behind it inert and no accessible role on it is
    // reachable — which is the same fact the assertion is about.
    expect(within(thing).queryByText('Reading the referenced Space…')).toBeNull();
    expect(within(thing).getByTestId('space-thing-diagram')).toBeDisabled();
    expect(within(thing).getByTestId('space-thing-graph')).toBeDisabled();
    await settled(session);
  });

  it('writes the chosen Diagram and re-seeds the Graph from it', async () => {
    const session = mount();
    await openSpaceThing();

    choose('space-thing-diagram', 'Collection 2');

    await waitFor(() =>
      expect(spaceThingDocument(session)).toEqual({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: SECOND_DIAGRAM_ID,
        graph: THIRD_GRAPH_ID,
      }),
    );
    await settled(session);
  });

  /**
   * The seed is the Diagram's own Active Graph where it has one.
   *
   * A Diagram answers "which Graph is current here" itself (ADR 0026), and a
   * Space Thing that showed a different one would be disagreeing with the Diagram
   * it had just been pointed at. The head of the list is the fallback rather
   * than the rule — which is what ADR 0026 says an absent `activeGraph` means.
   */
  it('seeds the Graph from the chosen Diagram’s Active Graph', async () => {
    const session = mount();
    await openSpaceThing();

    choose('space-thing-diagram', 'Collection 3');

    await waitFor(() =>
      expect(spaceThingDocument(session)).toMatchObject({
        diagram: THIRD_DIAGRAM_ID,
        graph: FIFTH_GRAPH_ID,
      }),
    );
    await settled(session);
  });

  it('writes a Graph chosen from the Diagram already selected', async () => {
    const session = mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        diagram: FIRST_DIAGRAM_ID,
        graph: FIRST_GRAPH_ID,
      }),
    );
    await openSpaceThing();

    choose('space-thing-graph', 'Detail');

    await waitFor(() =>
      expect(spaceThingDocument(session)).toMatchObject({
        diagram: FIRST_DIAGRAM_ID,
        graph: SECOND_GRAPH_ID,
      }),
    );
    await settled(session);
  });

  /**
   * A selection is authored state and not a view preference, so it has to
   * survive the snapshot it was written into being reopened. Asserting the
   * session alone would not say that: the same two ids have to come back as the
   * *selected* rows of a freshly composed app, which is the only thing that
   * proves the Thing reads its own stored selection rather than defaulting.
   */
  it('keeps both selections in the snapshot, and shows them selected on reopening', async () => {
    const session = mount();
    await openSpaceThing();
    choose('space-thing-diagram', 'Collection 2');
    await waitFor(() =>
      expect(spaceThingDocument(session)).toMatchObject({
        diagram: SECOND_DIAGRAM_ID,
        graph: THIRD_GRAPH_ID,
      }),
    );
    await settled(session);
    const written = session.getState().working;
    cleanup();

    const reopened = mount(written);

    const thing = await openSpaceThing();
    expect(within(thing).getByTestId('space-thing-diagram')).toHaveTextContent('Collection 2');
    expect(within(thing).getByTestId('space-thing-graph')).toHaveTextContent('Second pass');
    await settled(reopened);
  });

  /**
   * The target is chosen once, at creation, and Space Authoring refuses a
   * changed one on its own account (ADR 0068) — so there is nothing on the Open
   * Thing that would even ask. Two controls, and nothing beside them that would
   * be a third.
   */
  it('offers no way to change the Space it references', async () => {
    const session = mount();

    const thing = await openSpaceThing();

    // Exactly two, named: a third would be the retarget control this Thing is
    // not allowed to have, whatever it happened to be labelled.
    expect(choiceControls(thing)).toHaveLength(2);
    expect(
      within(thing).getByRole('button', { name: 'Diagram: Collection 1' }),
    ).toBeInTheDocument();
    expect(within(thing).getByRole('button', { name: 'Graph: Overview' })).toBeInTheDocument();
    await settled(session);
  });
});
