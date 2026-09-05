import { fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, type SpaceSession } from '@project/persistence';
import { mountSpace } from './space-mounting';
import { composeApp } from '../src/compose-app';
import { openTestSpace } from './opened-space';

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
    title: 'Space',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout',
        kind: 'positioned',
        positions: {
          [CARD_ID]: { x: 10, y: 20, open: false },
          [OTHER_CARD_ID]: { x: 300, y: 20, open: false },
        },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [{ from: CARD_ID, to: OTHER_CARD_ID }] }],
      },
    ],
    defaultLayout: LAYOUT_ID,
  },
  cards: [
    { id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } },
    { id: OTHER_CARD_ID, document: { title: 'B', kind: 'markdown', body: 'B source' } },
  ],
});

/** The same Space with an Alias of A already in it, for existing-Alias tests. */
const aliased: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    layouts: [
      {
        ...snapshot.document.layouts![0],
        positions: {
          ...snapshot.document.layouts![0]!.positions,
          [ALIAS_ID]: { x: 600, y: 20, open: false },
        },
      },
    ],
  },
  cards: [
    ...snapshot.cards,
    { id: ALIAS_ID, document: { title: 'A again', kind: 'alias', target: CARD_ID } },
  ],
});

/**
 * A Space with nothing an Alias could name.
 *
 * A Space of only Aliases is not a Space that loads — every Target would have to
 * resolve to a non-Alias — so the only way to reach an empty Target picker is a
 * Space with no Cards at all.
 */
const noCards: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout',
        kind: 'positioned',
        positions: {},
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
      },
    ],
    defaultLayout: LAYOUT_ID,
  },
  cards: [],
});

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

function mount(value: SpaceSnapshot = snapshot): SpaceSession {
  const stored = { snapshot: value, revision: 0n, exportedRevision: null };
  const { spaceSession: session, spaceCards } = openTestSpace(
    new MemorySpaceBackend([stored]),
    stored,
  );
  let view: RenderResult | undefined;
  mountSpace(
    { id: runtime(value).id, session, app: composeApp({ spaceSession: session }), spaceCards },
    (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    },
  );
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

/** Wait for the Cards to reach the canvas, which is what makes Card authoring available. */
async function readyToAuthor(): Promise<HTMLElement> {
  const addCard = await screen.findByRole('button', { name: 'Add Card' });
  await waitFor(() => expect(addCard).toBeEnabled());
  return addCard;
}

async function openAliasCreation(): Promise<void> {
  await readyToAuthor();
  const addCardMenu = screen.getByRole('button', { name: 'More Card kinds' });
  fireEvent.pointerDown(addCardMenu, { button: 0 });
  fireEvent.pointerUp(addCardMenu, { button: 0 });
  fireEvent.click(addCardMenu);
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

  /**
   * The created Card is selected as well as named, and selected in the sense
   * React Flow means — not only in the sense Authoring does.
   *
   * The two are separate notions and the Card is created between them: the
   * store's `selectedCardId` is set in the same tick as the Edit, one render
   * before the projection that first draws the new node. A projection carries
   * no selection of its own, so unless the fold seeds it, the new node arrives
   * unselected and the two notions disagree for good — the Card reads as
   * selected on screen while React Flow has no selected node at all. `F2` asks
   * React Flow, so it is what notices.
   */
  it('leaves the created Card selected for F2, not only for authoring', async () => {
    const session = mount();
    fireEvent.click(await readyToAuthor());
    // Out of the naming editor creation opens, so `F2` is answered by the
    // canvas rather than typed into a field.
    const naming = await screen.findByRole('textbox', { name: 'Card title' });
    fireEvent.keyDown(naming, { key: 'Escape' });
    const created = cardsOf(session)[2]!;
    const node = document.querySelector(`.react-flow__node[data-id="${created.id}"]`);
    if (node === null) throw new Error('the created Card is not drawn as a node');

    fireEvent.keyDown(node, { key: 'F2' });

    const renaming = await screen.findByRole('textbox', { name: 'Card title' });
    expect(renaming).toHaveValue('Card 1');
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
   * An empty Layout is the state Add Layout leaves behind, and the one a
   * layoutless Space is initialized into (ADR 0079). A Space with no Layout at
   * all no longer reaches this surface — `SpaceApp.test.tsx` owns Add Layout
   * itself, and working-state initialization owns the Layout being there.
   */
  it('creates the first Card of an empty Layout as its only member', async () => {
    const session = mount(noCards);

    fireEvent.click(await readyToAuthor());

    const layout = layoutsOf(session)[0]!;
    expect(cardTitles(session)).toEqual(['Card 1']);
    expect(layout.graphs).toEqual([expect.objectContaining({ edges: [] })]);
    expect(Object.keys(layout.positions)).toHaveLength(1);
    await settled(session);
  });
});

describe('Add Alias', () => {
  /**
   * The creation state is editor-local and nothing else (ADR 0042): no Card, no
   * authored Card and no commit. This is the package's own gate — cancelling before a
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
  it.skip('replaced by Dialog Escape-as-Cancel coverage', async () => {
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

  /**
   * The title field is a draft like the search beside it, and the contract does
   * not exempt it: "a field draft consumes the first Escape without closing its
   * containing surface; a second Escape may then close that surface".
   *
   * Its stored value is the empty string — there is no Alias yet for it to have
   * been read off — so restoring it is clearing it, and the pane stays open on a
   * Target still unchosen.
   */
  it.skip('replaced by Dialog Escape-as-Cancel coverage for the Alias title', async () => {
    const session = mount();
    await openAliasCreation();
    const title = screen.getByTestId('new-alias-title');
    fireEvent.change(title, { target: { value: 'Recap' } });

    fireEvent.keyDown(title, { key: 'Escape' });

    expect(title).toHaveValue('');
    expect(screen.getByTestId('new-alias')).toBeVisible();

    fireEvent.keyDown(title, { key: 'Escape' });

    expect(screen.queryByTestId('new-alias')).not.toBeInTheDocument();
    expect(cardTitles(session)).toEqual(['A', 'B']);
    await settled(session);
  });

  /**
   * The other half of the same rule, and the one that stops it being read as
   * "Escape never closes from a field": an untouched field owns no draft, so it
   * hands the gesture on and the surface closes on the first press.
   */
  it('closes on one Escape from a title field the author never typed in', async () => {
    const session = mount();
    await openAliasCreation();

    fireEvent.keyDown(screen.getByTestId('new-alias-title'), { key: 'Escape' });

    expect(screen.queryByTestId('new-alias')).not.toBeInTheDocument();
    expect(cardTitles(session)).toEqual(['A', 'B']);
    await settled(session);
  });

  it('opens on the Target picker, which searches non-Alias Cards by title', async () => {
    const session = mount(aliased);
    await openAliasCreation();
    const search = screen.getByRole('combobox', { name: 'Target' });

    await waitFor(() => expect(search).toHaveFocus());
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    // The Alias already in the Space is not offered: a Target must own its
    // content, so no chain can be authored (ADR 0009).
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['A', 'B']);

    fireEvent.change(search, { target: { value: 'b' } });

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['B']);
    await settled(session);
  });

  it('keeps a title the author entered instead of the Target’s', async () => {
    const session = mount();
    await openAliasCreation();

    fireEvent.change(screen.getByTestId('new-alias-title'), { target: { value: 'Recap' } });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Target' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Markdown Card A' }));

    expect(cardsOf(session)[2]?.document).toEqual({
      title: 'Recap',
      kind: 'alias',
      target: CARD_ID,
    });
    await settled(session);
  });

  /**
   * The created Alias is where the author continues, exactly as after Add Card.
   *
   * Both creations end at the Card they made, with its name editor open on it,
   * and both reach that through the one continuation `card-creation.ts`
   * publishes. Asserted here because the editor now arrives on the render
   * after the pane closes rather than in the same commit, and because a Space
   * Card takes the other branch — its title was typed on the pane, so it
   * returns to Add Card with nothing to name.
   */
  it('opens the created Alias’s name editor, on the Alias', async () => {
    const session = mount();
    await openAliasCreation();

    fireEvent.change(screen.getByTestId('new-alias-title'), { target: { value: 'Recap' } });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Target' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Markdown Card A' }));

    const input = await screen.findByRole('textbox', { name: 'Card title' });
    expect(input).toHaveValue('Recap');
    expect(input).toHaveFocus();
    expect(screen.queryByTestId('new-alias')).not.toBeInTheDocument();
    await settled(session);
  });

  /**
   * An Alias needs a Card that owns its content, and a Space may not have one.
   *
   * The message is cmdk's own empty affordance rather than a paragraph beside
   * it, which is what keeps it to one: `Command.Empty` renders whenever the
   * filtered count is zero, and with no Card registered that is true of every
   * search — so a hand-rolled explanation next to it would stack under "No Card
   * matches that search" rather than replace it.
   */
  it('explains itself when the Space holds no eligible Card', async () => {
    const session = mount(noCards);
    await openAliasCreation();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Target' }), { key: 'ArrowDown' });

    expect(
      screen.getAllByText(
        'An Alias needs a Card that owns its content, and this Space has none yet.',
      ),
    ).not.toHaveLength(0);
    expect(screen.queryByText('No Card matches that search.')).not.toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    await settled(session);
  });

  /**
   * The explanation has to reach the combobox, not merely the screen.
   *
   * `Command.Empty` is `role="presentation"` inside the `role="listbox"`, so a
   * reader who lands on the field hears an expanded combobox with no options
   * and no reason. A live region does not fix that: this pane mounts with the
   * message already in it, and a live region inserted already populated is the
   * least reliably announced form there is. A description does — it is read
   * when focus arrives, which is where this picker puts it.
   */
  it('describes the combobox with the reason there is nothing to choose', async () => {
    const session = mount(noCards);
    await openAliasCreation();

    expect(screen.getByRole('combobox', { name: 'Target' })).toHaveAccessibleDescription(
      'An Alias needs a Card that owns its content, and this Space has none yet.',
    );
    await settled(session);
  });

  /**
   * And drops it once there is something to choose. `Command.Empty` unmounts on
   * a non-zero filter count, so a description left pointing at it would name an
   * element that is no longer there.
   */
  it('describes nothing once the Space holds a Card to choose', async () => {
    const session = mount();
    await openAliasCreation();

    expect(screen.getByRole('combobox', { name: 'Target' })).not.toHaveAccessibleDescription();
    await settled(session);
  });

  /**
   * cmdk mints its own `id` on the input *after* spreading the caller's props,
   * so a `for` written here names an element that never exists — and the pane's
   * focus containment prevents the mousedown default on a label, on the stated
   * grounds that a label focuses what it names, which such a label does not.
   * The rule is general, so the assertion is: no orphan labels anywhere.
   */
  it('leaves no label pointing at a control that does not exist', async () => {
    const session = mount();
    await openAliasCreation();

    const orphans = [...document.querySelectorAll('label[for]')].filter(
      (label) => document.getElementById(label.getAttribute('for') ?? '') === null,
    );

    expect(orphans.map((label) => label.textContent)).toEqual([]);
    await settled(session);
  });

  /**
   * cmdk mints the list's id on the Command root and puts it on the input as
   * `aria-controls`, alongside a hardcoded `aria-expanded="true"`. Drawing the
   * field without its list therefore leaves an expanded combobox pointing at an
   * element that is not in the document — which is what a standalone paragraph
   * in place of the list used to do, on the one screen it was drawn: Alias
   * creation in an empty Space.
   */
  it('keeps the combobox pointing at a list that exists with nothing to list', async () => {
    const session = mount(noCards);
    await openAliasCreation();
    const search = screen.getByRole('combobox', { name: 'Target' });

    const listId = search.getAttribute('aria-controls');

    expect(listId).toBeNull();
    expect(document.getElementById(listId ?? '')).toBeNull();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const openedListId = search.getAttribute('aria-controls');
    const results = screen.getByTestId('card-picker-results');
    expect(openedListId).not.toBeNull();
    expect(document.getElementById(openedListId ?? '')).toBe(results);
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

/**
 * The Alias creation pane is a modal surface, and everything the graph offers
 * has to be withdrawn behind it.
 *
 * The toolbar already knows this — its Add Card control is disabled on
 * `creatingAlias` as well as on an opened Card — and the canvas was told only
 * about the opened Card. Both panes cover the graph the same way, so both have
 * to withdraw the same affordances.
 */
describe('the graph behind the Alias creation pane', () => {
  it('answers no Add Card shortcut while the pane is open', async () => {
    const session = mount();
    await openAliasCreation();

    fireEvent.keyDown(screen.getByTestId(`rf__node-${CARD_ID}`), { key: 'c' });

    expect(cardTitles(session)).toEqual(['A', 'B']);
    await settled(session);
  });

  /**
   * `openCardForEditing` declines a second open while a Card is open, on the
   * stated grounds that the pane covers the graph so a pointer could not reach
   * one either. The Alias pane covers it identically.
   *
   * Declining rather than clearing `creatingAlias`: the author's unfinished
   * creation state is theirs, and an `Enter` landing behind the pane is not a
   * request to discard it. Without this the Card opened behind the pane, which
   * hid itself while a Card was open and came back when it closed.
   */
  it('declines to open a Card, leaving the pane exactly as it was', async () => {
    const session = mount();
    await openAliasCreation();
    fireEvent.change(screen.getByTestId('new-alias-title'), { target: { value: 'Recap' } });

    fireEvent.keyDown(screen.getByTestId(`rf__node-${CARD_ID}`), { key: 'Enter' });

    expect(screen.queryByRole('button', { name: /^Close Card / })).not.toBeInTheDocument();
    expect(screen.getByTestId('new-alias')).toBeVisible();
    expect(screen.getByTestId('new-alias-title')).toHaveValue('Recap');
    await settled(session);
  });
});

/**
 * cmdk's List takes a `label` and defaults it to `Suggestions` (confirmed in
 * the pinned 1.1.1 dist). The root's `label` names the combobox, not the
 * listbox beside it, so without this the Target picker's results announce as a
 * generic suggestion list on every pane that draws one.
 */
describe('the Target picker’s results list', () => {
  it('is named for the field it belongs to', async () => {
    const session = mount();
    await openAliasCreation();

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Target' }), { key: 'ArrowDown' });
    expect(screen.getByRole('listbox', { name: 'Target' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId('new-alias-title'), { key: 'Escape' });
    await settled(session);
  });
});
