import { fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession, type SpaceSession } from '@project/persistence';
import { mountWorkspace } from '../src/Workspace';

/**
 * Creating Cards, from the controls an author actually has.
 *
 * The domain half of both operations is proven at the authoring interface
 * (`space-authoring-operations.test.ts`) and held to its invariants under
 * hostile sequences (`space-authoring.property.test.ts`). Nothing here
 * re-derives any of it. What these tests are about is the half that only exists
 * once there is a surface: that the control reaches the operation at all, that
 * the Alias creation state creates nothing until a Target is chosen, and that
 * focus lands where the keyboard contract says it does.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const snapshot: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Workspace',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout',
        kind: 'positioned',
        positions: { [CARD_ID]: { x: 10, y: 20 }, [OTHER_CARD_ID]: { x: 300, y: 20 } },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [{ from: CARD_ID, to: OTHER_CARD_ID }] }],
      },
    ],
    defaultView: LAYOUT_ID,
  },
  cards: [
    { id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } },
    { id: OTHER_CARD_ID, document: { title: 'B', kind: 'markdown', body: 'B source' } },
  ],
});

/** The same Space with an Alias of A already in it, for the retargeting tests. */
const aliased: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    layouts: [
      {
        ...snapshot.document.layouts![0],
        positions: {
          ...snapshot.document.layouts![0]!.positions,
          [ALIAS_ID]: { x: 600, y: 20 },
        },
      },
    ],
  },
  cards: [
    ...snapshot.cards,
    { id: ALIAS_ID, document: { title: 'A again', kind: 'alias', target: CARD_ID } },
  ],
});

/** A Space with no Layout at all, so the Flow Algorithmic View draws it (ADR 0025). */
const noLayouts: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: { version: 1, title: 'Workspace' },
});

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

function mount(value: SpaceSnapshot = snapshot): SpaceSession {
  const stored = { snapshot: value, revision: 0n, exportedRevision: null };
  const session = openSpaceSession(new MemorySpaceBackend([stored]), stored);
  let view: RenderResult | undefined;
  mountWorkspace({ space: runtime(value), spaceSession: session }, (app) => {
    if (view === undefined) view = render(app);
    else view.rerender(app);
  });
  return session;
}

const cardsOf = (session: SpaceSession) => session.getState().working.cards;
const layoutsOf = (session: SpaceSession) => session.getState().working.document.layouts ?? [];
const cardTitles = (session: SpaceSession) => cardsOf(session).map((card) => card.document.title);

/**
 * Persistence and placement are both asynchronous, so a test that ends the
 * moment it has asserted leaves them to land against an unmounted tree.
 */
const settled = (session: SpaceSession): Promise<void> =>
  waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

/** Wait for the arrangement, which is what makes Card authoring available. */
async function readyToAuthor(): Promise<HTMLElement> {
  const addCard = await screen.findByRole('button', { name: 'Add Card' });
  await waitFor(() => expect(addCard).toBeEnabled());
  return addCard;
}

async function openAliasCreation(): Promise<void> {
  await readyToAuthor();
  fireEvent.keyDown(screen.getByRole('button', { name: 'More Card kinds' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Add Alias' }));
  await screen.findByTestId('new-alias');
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
  // Radix's menu reaches for pointer capture, and jsdom has none.
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
});

afterAll(() => vi.unstubAllGlobals());

describe('Add Card', () => {
  it('creates a neutrally titled Card and opens its name editor', async () => {
    const session = mount();

    fireEvent.click(await readyToAuthor());

    expect(cardTitles(session)).toEqual(['A', 'B', 'Card 1']);
    const created = cardsOf(session)[2]!;
    expect(layoutsOf(session)[0]?.positions[created.id]).toBeDefined();
    // The neutral title is selected in the editor, so typing replaces it. The
    // editor arrives with the projection that first draws the created Card.
    const input = await screen.findByRole('textbox', { name: 'Card title' });
    expect(input).toHaveValue('Card 1');
    expect(input).toHaveFocus();
    await settled(session);
  });

  it('renames the created Card in place, and leaves focus on the Card', async () => {
    const session = mount();
    fireEvent.click(await readyToAuthor());
    const input = await screen.findByRole('textbox', { name: 'Card title' });

    fireEvent.change(input, { target: { value: 'Consequences' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(cardTitles(session)).toEqual(['A', 'B', 'Consequences']);
    const created = cardsOf(session)[2]!;
    expect(document.querySelector(`.react-flow__node[data-id="${created.id}"]`)).toHaveFocus();
    await settled(session);
  });

  /**
   * The Card is already created by the time the editor opens — there is no
   * creation draft — so Escape cancels the *rename* and nothing else. Focus
   * still has to land on the Card rather than on `<body>`.
   */
  it('keeps the Card when its naming is cancelled', async () => {
    const session = mount();
    fireEvent.click(await readyToAuthor());

    const input = await screen.findByRole('textbox', { name: 'Card title' });
    fireEvent.change(input, { target: { value: 'Abandoned' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(cardTitles(session)).toEqual(['A', 'B', 'Card 1']);
    const created = cardsOf(session)[2]!;
    expect(document.querySelector(`.react-flow__node[data-id="${created.id}"]`)).toHaveFocus();
    await settled(session);
  });

  /** The toolbar control and `C` are the same operation, reached two ways. */
  it('is reachable with C from the graph', async () => {
    const session = mount();
    await readyToAuthor();
    const card = (await screen.findByRole('heading', { name: 'A' })).closest('.react-flow__node');
    if (card === null) throw new Error('Card A is not drawn as a node');

    fireEvent.keyDown(card, { key: 'c' });

    expect(cardTitles(session)).toEqual(['A', 'B', 'Card 1']);
    await settled(session);
  });

  /**
   * Creating a Card from an Algorithmic View converts it (ADR 0025), and that
   * conversion is one Edit: the Cards on screen keep their positions, and the
   * Layout it produces owns the initial empty Graph a Layout is created with.
   */
  it('converts an Algorithmic View exactly once', async () => {
    const session = mount(noLayouts);
    expect(layoutsOf(session)).toEqual([]);

    fireEvent.click(await readyToAuthor());

    await waitFor(() => expect(layoutsOf(session)).toHaveLength(1));
    const layout = layoutsOf(session)[0]!;
    expect(layout.graphs).toEqual([expect.objectContaining({ edges: [] })]);
    // Every Card the View was drawing, plus the new one.
    expect(Object.keys(layout.positions)).toHaveLength(3);
    await settled(session);
  });
});

describe('Add Alias', () => {
  /**
   * The creation state is editor-local and nothing else (ADR 0042): no Card, no
   * conversion, no commit. This is the package's own gate — cancelling before a
   * Target creates nothing.
   */
  it('creates nothing when it is cancelled before a Target is chosen', async () => {
    const session = mount();
    const before = session.getState().working;
    await openAliasCreation();

    fireEvent.change(screen.getByRole('combobox', { name: 'Target' }), {
      target: { value: 'A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('new-alias')).not.toBeInTheDocument();
    expect(session.getState().working).toBe(before);
    // Cancelled or completed, focus never lands on `<body>`.
    expect(screen.getByRole('button', { name: 'More Card kinds' })).toHaveFocus();
    await settled(session);
  });

  /**
   * Escape is consumed by exactly one topmost owner. The search field is a draft
   * and takes the first; only then may the surface take the next.
   */
  it('spends the first Escape on the search draft and the second on the surface', async () => {
    const session = mount();
    await openAliasCreation();
    const search = screen.getByRole('combobox', { name: 'Target' });
    fireEvent.change(search, { target: { value: 'A' } });

    fireEvent.keyDown(search, { key: 'Escape' });

    expect(search).toHaveValue('');
    expect(screen.getByTestId('new-alias')).toBeVisible();

    fireEvent.keyDown(search, { key: 'Escape' });

    expect(screen.queryByTestId('new-alias')).not.toBeInTheDocument();
    expect(cardTitles(session)).toEqual(['A', 'B']);
    await settled(session);
  });

  it('opens on the Target picker, which searches non-Alias Cards by title', async () => {
    const session = mount(aliased);
    await openAliasCreation();
    const search = screen.getByRole('combobox', { name: 'Target' });

    expect(search).toHaveFocus();
    // The Alias already in the Space is not offered: a Target must own its
    // content, so no chain can be authored (ADR 0009).
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['A', 'B']);

    fireEvent.change(search, { target: { value: 'b' } });

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['B']);
    await settled(session);
  });

  it('creates the Alias on the Target, taking its title, and stays open on it', async () => {
    const session = mount();
    await openAliasCreation();

    fireEvent.click(screen.getByRole('option', { name: 'Markdown Card A' }));

    const created = cardsOf(session)[2]!;
    expect(created.document).toEqual({ title: 'A', kind: 'alias', target: CARD_ID });
    expect(layoutsOf(session)[0]?.positions[created.id]).toBeDefined();
    // "The editor remains open on the now-authored Alias", which for an Alias is
    // the delegated editor over the content its Target owns.
    expect(screen.queryByTestId('new-alias')).not.toBeInTheDocument();
    expect(await screen.findByText('Opened through A')).toBeVisible();
    await settled(session);
  });

  it('keeps a title the author entered instead of the Target’s', async () => {
    const session = mount();
    await openAliasCreation();

    fireEvent.change(screen.getByTestId('new-alias-title'), { target: { value: 'Recap' } });
    fireEvent.click(screen.getByRole('option', { name: 'Markdown Card A' }));

    expect(cardsOf(session)[2]?.document).toEqual({
      title: 'Recap',
      kind: 'alias',
      target: CARD_ID,
    });
    await settled(session);
  });

  /**
   * An Alias needs a Card that owns its content, and a Space may not have one.
   * A Space of only Aliases is not a Space that loads — every Target would have
   * to resolve to a non-Alias — so the case is a Space with no Cards at all.
   */
  it('explains itself when the Space holds no eligible Card', async () => {
    const session = mount(
      spaceSnapshotSchema.parse({
        id: SPACE_ID,
        document: { version: 1, title: 'Workspace' },
        cards: [],
      }),
    );
    await openAliasCreation();

    expect(screen.getByRole('status')).toHaveTextContent(
      'An Alias needs a Card that owns its content, and this Space has none yet.',
    );
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    await settled(session);
  });
});

describe('an Alias on the graph', () => {
  it('names its kind and the Target it shows', async () => {
    const session = mount(aliased);

    const alias = (await screen.findByRole('heading', { name: 'A again' })).closest(
      '.react-flow__node',
    );
    if (alias === null) throw new Error('The Alias is not drawn as a node');
    expect(alias).toContainElement(screen.getByRole('img', { name: 'Alias' }));
    // The Target's title, read-only, under the Alias's own.
    expect(screen.getByTestId('alias-marker')).toHaveTextContent('A');
    await settled(session);
  });
});

describe('retargeting an Alias', () => {
  it('moves the Target while keeping the Alias’s identity, title and position', async () => {
    const session = mount(aliased);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A again' }));
    fireEvent.click(screen.getByRole('option', { name: 'Markdown Card B' }));

    expect(cardsOf(session)).toContainEqual({
      id: ALIAS_ID,
      document: { title: 'A again', kind: 'alias', target: OTHER_CARD_ID },
    });
    expect(layoutsOf(session)[0]?.positions[ALIAS_ID]).toEqual({ x: 600, y: 20 });
    await settled(session);
  });

  /**
   * The Target field is the Alias's, and the fields under it author the Card
   * that owns the content — two Cards, one pane, which is the arrangement ADR
   * 0039 warns about. The check is that the pane's *own* editor still writes
   * where it always did.
   */
  it('leaves the content editor authoring the content owner', async () => {
    const session = mount(aliased);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A again' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      target: { value: 'Written through the Alias' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(cardsOf(session)).toContainEqual({
      id: CARD_ID,
      document: { title: 'A', kind: 'markdown', body: 'Written through the Alias' },
    });
    await settled(session);
  });

  /** A Card that owns its content has no Target, so the field is not drawn. */
  it('is not offered on a Card opened on its own content', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A' }));

    expect(screen.queryByRole('combobox', { name: 'Target' })).not.toBeInTheDocument();
    await settled(session);
  });
});

/**
 * Presenting is read-only, and no authoring surface may survive into it.
 * Navigation clears an opened Card on its way in; the Alias creation state is
 * App's own, and the toolbar that starts a presentation is not covered by it.
 */
describe('presenting while the Alias creation state is open', () => {
  it('closes it, creating nothing', async () => {
    const session = mount();
    await openAliasCreation();

    fireEvent.click(screen.getByTestId('present-button'));

    expect(screen.queryByTestId('new-alias')).not.toBeInTheDocument();
    expect(cardTitles(session)).toEqual(['A', 'B']);
    await settled(session);
  });
});
