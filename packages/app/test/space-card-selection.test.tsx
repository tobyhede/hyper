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
  type CardDocument,
  type SpaceSnapshot,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, type SpaceSession } from '@project/persistence';
import { mountSpace } from './space-mounting';
import { composeApp } from '../src/compose-app';
import { openTestSpace } from './opened-space';

/**
 * The two selections an Open Space Card authors.
 *
 * A Space Card's content is the Layout it selects of the Space it
 * references (ADR 0068), so Opening it is what exposes the only two things
 * about it an author can change — and the target reference is deliberately not
 * one of them: it is chosen once, at creation, and no control on the Open Card
 * reaches it.
 *
 * The pairing is the point of these tests rather than either control on its
 * own: a Graph is owned by the Layout that holds it (ADR 0040), so the Graphs
 * on offer are the selected Layout's and choosing a Layout re-seeds the Graph
 * from it. The alternative — leaving the previous Layout's Graph in place — is
 * a Card the aggregate refuses, so the re-seed is a domain rule and not a
 * courtesy.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const META_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const META_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const META_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const META_TO_HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const META_TO_TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const HOME_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');
const HOME_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000011');
const HOME_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000012');
const HOME_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000013');
const SPACE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000014');

const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000020');
const TARGET_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const FIRST_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');
const FIRST_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const SECOND_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const SECOND_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000025');
const THIRD_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const THIRD_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000027');
const FOURTH_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000028');
const FIFTH_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000029');

/**
 * The Space this Card references: two Layouts, and the first owning two Graphs.
 *
 * Two of each is the smallest fixture that can tell the two selectors apart —
 * one Layout would make every Graph list the same list, and one Graph per
 * Layout would make the re-seed indistinguishable from leaving the selection
 * alone.
 */
const target: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: TARGET_ID,
  document: {
    version: 1,
    title: 'Architecture',
    layouts: [
      {
        id: FIRST_LAYOUT_ID,
        title: 'Collection 1',
        kind: 'positioned',
        positions: { [TARGET_CARD_ID]: { x: 0, y: 0, open: false } },
        graphs: [
          { id: FIRST_GRAPH_ID, title: 'Overview', edges: [] },
          { id: SECOND_GRAPH_ID, title: 'Detail', edges: [] },
        ],
      },
      {
        id: SECOND_LAYOUT_ID,
        title: 'Collection 2',
        kind: 'positioned',
        positions: { [TARGET_CARD_ID]: { x: 200, y: 0, open: false } },
        graphs: [{ id: THIRD_GRAPH_ID, title: 'Second pass', edges: [] }],
      },
      // The one Layout that has authored an Active Graph, and deliberately not
      // its first: a seed taken from the head of the list agrees with an
      // authored `activeGraph` everywhere else, so nothing but this Layout can
      // tell the two rules apart.
      {
        id: THIRD_LAYOUT_ID,
        title: 'Collection 3',
        kind: 'positioned',
        positions: { [TARGET_CARD_ID]: { x: 400, y: 0, open: false } },
        graphs: [
          { id: FOURTH_GRAPH_ID, title: 'Draft', edges: [] },
          { id: FIFTH_GRAPH_ID, title: 'Current', edges: [] },
        ],
        activeGraph: FIFTH_GRAPH_ID,
      },
    ],
    defaultLayout: FIRST_LAYOUT_ID,
  },
  cards: [{ id: TARGET_CARD_ID, document: { title: 'Card 1', kind: 'markdown', body: '' } }],
});

/**
 * The Space the app opens, holding one Space Card that points at the target.
 *
 * The document is the schema-derived one rather than a loose record, so a test
 * that seeds a selection is writing the same shape authoring writes — and one
 * that seeds a *stale* selection has to say so with real ids rather than with a
 * value the type would not have allowed.
 */
const home = (spaceCard: Extract<CardDocument, { kind: 'space' }>): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id: HOME_ID,
    document: {
      version: 1,
      title: 'Home',
      layouts: [
        {
          id: HOME_LAYOUT_ID,
          title: 'Layout 1',
          kind: 'positioned',
          positions: {
            [HOME_CARD_ID]: { x: 10, y: 20, open: false },
            [SPACE_CARD_ID]: { x: 600, y: 20, open: false },
          },
          graphs: [{ id: HOME_GRAPH_ID, title: 'Graph 1', edges: [] }],
        },
      ],
      defaultLayout: HOME_LAYOUT_ID,
    },
    cards: [
      { id: HOME_CARD_ID, document: { title: 'Start here', kind: 'markdown', body: '' } },
      { id: SPACE_CARD_ID, document: spaceCard },
    ],
  });

/** The Space Card as created: a target and nothing selected of it yet. */
const unselected = home({ title: 'Elsewhere', kind: 'space', spaceId: TARGET_ID });

/**
 * Meta, which is here because the aggregate demands a sole root that reaches
 * every ordinary Space (ADR 0074) rather than because these tests are about it.
 */
const meta: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    layouts: [
      {
        id: META_LAYOUT_ID,
        title: 'Layout 1',
        kind: 'positioned',
        positions: {
          [META_CARD_ID]: { x: 0, y: 0, open: false },
          [META_TO_HOME_ID]: { x: 300, y: 0, open: false },
          [META_TO_TARGET_ID]: { x: 600, y: 0, open: false },
        },
        graphs: [{ id: META_GRAPH_ID, title: 'Graph 1', edges: [] }],
      },
    ],
    defaultLayout: META_LAYOUT_ID,
  },
  cards: [
    { id: META_CARD_ID, document: { title: 'Meta', kind: 'markdown', body: '' } },
    { id: META_TO_HOME_ID, document: { title: 'Home', kind: 'space', spaceId: HOME_ID } },
    {
      id: META_TO_TARGET_ID,
      document: { title: 'Architecture', kind: 'space', spaceId: TARGET_ID },
    },
  ],
});

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

/** Mount the app on one exact `Home` snapshot, with Meta and the target beside it. */
function mount(value: SpaceSnapshot = unselected): SpaceSession {
  const backend = new MemorySpaceBackend(META_ID, [
    { snapshot: meta, revision: 0n, exportedRevision: null },
    { snapshot: value, revision: 0n, exportedRevision: null },
    { snapshot: target, revision: 0n, exportedRevision: null },
  ]);
  const stored = { snapshot: value, revision: 0n, exportedRevision: null };
  const { spaceSession: session, spaceCards } = openTestSpace(backend, stored);
  let view: RenderResult | undefined;
  mountSpace(
    {
      id: runtime(value).id,
      session,
      app: composeApp({ spaceSession: session }),
      spaceCards,
    },
    (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    },
  );
  return session;
}

/** What the Space Card records, which is where a selection is authored. */
const spaceCardDocument = (session: SpaceSession) =>
  session.getState().working.cards.find((card) => card.id === SPACE_CARD_ID)?.document;

const settled = (session: SpaceSession): Promise<void> =>
  waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

/**
 * Reach the Space Card Open, and wait for its selectors.
 *
 * Both waits are real: the Card reaches the canvas with the asynchronous
 * placement, and its target is a *second* Space, read asynchronously after the
 * Card is already drawn — until that read lands the Open Card draws its waiting
 * note in place of the two controls.
 *
 * Open is authored on the Layout (ADR 0064), so a snapshot may already carry
 * it: the reopening test mounts one that does, and pressing Open there would
 * close the Card this helper is asked to open.
 */
async function openSpaceCard(): Promise<HTMLElement> {
  const control = await screen.findByRole('button', { name: /^(Open|Close) Card Elsewhere$/ });
  if (control.getAttribute('aria-label') === 'Open Card Elsewhere') fireEvent.click(control);
  await screen.findByTestId('space-card-layout');
  const node = document.querySelector(`.react-flow__node[data-id="${SPACE_CARD_ID}"]`);
  if (!(node instanceof HTMLElement)) throw new Error('the Space Card is not drawn as a node');
  return node;
}

/**
 * Choose one row of a Space Card selector.
 *
 * Base UI's own list: a keyboard press on the trigger opens it, and the row is
 * committed with the full pointer sequence, because a bare `click` reaches the
 * item before the pointer handlers that select it.
 */
function choose(testId: string, name: string): void {
  fireEvent.keyDown(screen.getByTestId(testId), { key: 'ArrowDown' });
  const option = screen.getByRole('option', { name });
  fireEvent.pointerDown(option, { button: 0 });
  fireEvent.pointerUp(option, { button: 0 });
  fireEvent.click(option);
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

describe('an Open Space Card', () => {
  /**
   * The marker names the target whether the Card is Open or Closed — which
   * Space this Card reaches is a fact about it — and Opening is what adds the
   * two controls that say *which part* of that Space it shows.
   */
  it('draws the Space it references and both of its selectors', async () => {
    const session = mount();

    const card = await openSpaceCard();

    expect(within(card).getByTestId('space-marker')).toHaveTextContent('Architecture');
    expect(within(card).getByRole('combobox', { name: 'Layout' })).toBeEnabled();
    // Nothing is selected yet, so the Layout offers the target's two and the
    // Graph beside it has no Layout to draw from.
    expect(within(card).getByRole('combobox', { name: 'Graph' })).toBeDisabled();
    await settled(session);
  });

  /**
   * One Edit writes both keys, because they are not independent: a Graph is
   * owned by its Layout, so a Layout chosen without re-seeding the Graph names
   * a Graph the new Layout does not own, and the aggregate refuses exactly
   * that (ADR 0040, ADR 0068).
   */
  /**
   * The waiting note means one thing: the target Space has not been read yet.
   *
   * Authoring is withdrawn from the whole canvas while a creation pane is up —
   * one authoring surface at a time — and the selectors go with it. What must
   * not go with it is the *answer*: a Card that has read its target and is
   * showing the Space's name beside two controls cannot also be claiming it is
   * still reading it. Unavailable and unknown are different states and the
   * author can act on only one of them.
   */
  it('shows its selections unavailable rather than unread while a pane holds the canvas', async () => {
    const session = mount();
    const card = await openSpaceCard();

    const addCardMenu = screen.getByRole('button', { name: 'More Card kinds' });
    fireEvent.pointerDown(addCardMenu, { button: 0 });
    fireEvent.pointerUp(addCardMenu, { button: 0 });
    fireEvent.click(addCardMenu);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Add Space Card' }));
    await screen.findByTestId('new-space-card');

    // By test id rather than by role: the pane is modal, so Base UI has marked
    // the whole canvas behind it inert and no accessible role on it is
    // reachable — which is the same fact the assertion is about.
    expect(within(card).queryByText('Reading the referenced Space…')).toBeNull();
    expect(within(card).getByTestId('space-card-layout')).toBeDisabled();
    expect(within(card).getByTestId('space-card-graph')).toBeDisabled();
    expect(within(card).getByTestId('space-marker')).toHaveTextContent('Architecture');
    await settled(session);
  });

  it('writes the chosen Layout and re-seeds the Graph from it', async () => {
    const session = mount();
    await openSpaceCard();

    choose('space-card-layout', 'Collection 1');

    await waitFor(() =>
      expect(spaceCardDocument(session)).toEqual({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        layout: FIRST_LAYOUT_ID,
        graph: FIRST_GRAPH_ID,
      }),
    );
    await settled(session);
  });

  /**
   * The seed is the Layout's own Active Graph where it has one.
   *
   * A Layout answers "which Graph is current here" itself (ADR 0026), and a
   * Space Card that showed a different one would be disagreeing with the Layout
   * it had just been pointed at. The head of the list is the fallback rather
   * than the rule — which is what ADR 0026 says an absent `activeGraph` means.
   */
  it('seeds the Graph from the chosen Layout’s Active Graph', async () => {
    const session = mount();
    await openSpaceCard();

    choose('space-card-layout', 'Collection 3');

    await waitFor(() =>
      expect(spaceCardDocument(session)).toMatchObject({
        layout: THIRD_LAYOUT_ID,
        graph: FIFTH_GRAPH_ID,
      }),
    );
    await settled(session);
  });

  it('writes a Graph chosen from the Layout already selected', async () => {
    const session = mount(
      home({
        title: 'Elsewhere',
        kind: 'space',
        spaceId: TARGET_ID,
        layout: FIRST_LAYOUT_ID,
        graph: FIRST_GRAPH_ID,
      }),
    );
    await openSpaceCard();

    choose('space-card-graph', 'Detail');

    await waitFor(() =>
      expect(spaceCardDocument(session)).toMatchObject({
        layout: FIRST_LAYOUT_ID,
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
   * proves the Card reads its own stored selection rather than defaulting.
   */
  it('keeps both selections in the snapshot, and shows them selected on reopening', async () => {
    const session = mount();
    await openSpaceCard();
    choose('space-card-layout', 'Collection 2');
    await waitFor(() =>
      expect(spaceCardDocument(session)).toMatchObject({
        layout: SECOND_LAYOUT_ID,
        graph: THIRD_GRAPH_ID,
      }),
    );
    await settled(session);
    const written = session.getState().working;
    cleanup();

    const reopened = mount(written);

    const card = await openSpaceCard();
    expect(within(card).getByRole('combobox', { name: 'Layout' })).toHaveTextContent(
      'Collection 2',
    );
    expect(within(card).getByRole('combobox', { name: 'Graph' })).toHaveTextContent('Second pass');
    await settled(reopened);
  });

  /**
   * The target is chosen once, at creation, and Space Authoring refuses a
   * changed one on its own account (ADR 0068) — so there is nothing on the Open
   * Card that would even ask. Two controls, and the Space it names is read-only
   * text beside them rather than a third.
   */
  it('offers no way to change the Space it references', async () => {
    const session = mount();

    const card = await openSpaceCard();

    // Exactly two, named: a third would be the retarget control this Card is
    // not allowed to have, whatever it happened to be labelled.
    expect(within(card).getAllByRole('combobox')).toHaveLength(2);
    expect(within(card).getByRole('combobox', { name: 'Layout' })).toBeInTheDocument();
    expect(within(card).getByRole('combobox', { name: 'Graph' })).toBeInTheDocument();
    // And the marker is text rather than a control, so the Space it names is
    // not quietly a way in either.
    expect(within(card).getByTestId('space-marker').closest('button')).toBeNull();
    await settled(session);
  });
});
