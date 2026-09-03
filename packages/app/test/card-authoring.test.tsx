import { fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import {
  encodeCompactUuid,
  FLOW_SPACE_VIEW_ID,
  spaceSnapshotSchema,
  uuidSchema,
  type CardId,
  type LayoutPosition,
  type SpaceSnapshot,
} from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession, type SpaceSession } from '@project/persistence';
import { mountSpaceApp } from '../src/SpaceApp';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const SECOND_ALIAS_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const SPACE_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');
const TARGET_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000009');

/** Replace CodeMirror source through its public editable surface. */
const replaceMarkdownSource = (value: string): HTMLElement => {
  const source = screen.getByRole('textbox', { name: 'Markdown source of A' });
  source.focus();
  fireEvent.keyDown(source, { key: 'a', ctrlKey: true });
  fireEvent.paste(source, { clipboardData: { getData: () => value } });
  return source;
};

/**
 * Two Cards on one Graph the Layout owns, so the graph opens on a Positioned
 * renderer with a placement already installed and presenting has a traversal to
 * run.
 */
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
    defaultRenderer: LAYOUT_ID,
  },
  cards: [
    { id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } },
    { id: OTHER_CARD_ID, document: { title: 'B', kind: 'markdown', body: 'B source' } },
  ],
});

const selfEdge: SpaceSnapshot = spaceSnapshotSchema.parse({
  id: SPACE_ID,
  document: {
    version: 1,
    title: 'Space',
    defaultRenderer: LAYOUT_ID,
    layouts: [
      {
        id: LAYOUT_ID,
        title: 'Layout',
        kind: 'positioned',
        positions: { [CARD_ID]: { x: 10, y: 20, open: false } },
        graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [{ from: CARD_ID, to: CARD_ID }] }],
      },
    ],
  },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'A source' } }],
});

/**
 * The same content drawn three times: Card A and two Aliases of it, each placed
 * and titled in its own right.
 *
 * One Alias can only show that its target changed, which is the weaker half of
 * a single source of truth. Two is where an edit made through one occurrence
 * has somewhere else to be wrong — and where the editor's composite key stops
 * being redundant, since both Aliases resolve to the same content id.
 */
const twiceAliased: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    layouts: [
      {
        ...snapshot.document.layouts![0],
        positions: {
          ...snapshot.document.layouts![0]!.positions,
          [ALIAS_ID]: { x: 600, y: 20, open: false },
          [SECOND_ALIAS_ID]: { x: 900, y: 20, open: false },
        },
      },
    ],
  },
  cards: [
    ...snapshot.cards,
    { id: ALIAS_ID, document: { title: 'A again', kind: 'alias', target: CARD_ID } },
    { id: SECOND_ALIAS_ID, document: { title: 'A once more', kind: 'alias', target: CARD_ID } },
  ],
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
  mountSpaceApp({ space: runtime(value), spaceSession: session }, (app) => {
    if (view === undefined) view = render(app);
    else view.rerender(app);
  });
  return session;
}

const cardTitleOf = (session: SpaceSession, cardId: string): string | undefined =>
  session.getState().working.cards.find((card) => card.id === cardId)?.document.title;

const bodyOf = (session: SpaceSession, cardId: string): string | undefined => {
  const document = session.getState().working.cards.find((card) => card.id === cardId)?.document;
  return document?.kind === 'markdown' ? document.body : undefined;
};

/**
 * Persistence is asynchronous and the strategy that places Cards is too, so a
 * test that ends the moment it has asserted leaves both to land against an
 * unmounted tree. Waiting for the session to settle is the app's own signal that
 * everything a completed Edit started has finished.
 */
const settled = (session: SpaceSession): Promise<void> =>
  waitFor(() => expect(session.getState().persistence.kind).toBe('settled'));

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
});

afterAll(() => vi.unstubAllGlobals());

describe('authoring a Card title on the graph', () => {
  /**
   * `z.string().min(1)` counts characters, and a space is one — so the schema
   * alone accepts a title that draws as nothing, leaving a Card that cannot be
   * told apart from its neighbours and an `Edit title of` label naming nobody.
   * Blank is the empty case wearing different bytes.
   */
  it('refuses a blank title and leaves the stored Card alone', async () => {
    const session = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Card title' });

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent('A Card title is required.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(cardTitleOf(session, CARD_ID)).toBe('A');
    await settled(session);
  });

  it('stores a title without the whitespace surrounding it', async () => {
    const session = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Card title' });

    fireEvent.change(input, { target: { value: '  Renamed A  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(cardTitleOf(session, CARD_ID)).toBe('Renamed A');
    await settled(session);
  });
});

/**
 * The gap between `present()`'s refusal and the control that calls it, at the one
 * place it now opens.
 *
 * Dropping a Graph's minimum Edge count made an empty Graph legal, and ADR 0040
 * made it *ordinary*: converting an Algorithmic View mints a Layout whose one
 * Active Graph holds nothing, so this is the state the author is in immediately
 * after their first edit on the Flow view. `graphStartCard` has no answer for
 * such a Graph, so `present()` returns having changed nothing — and an enabled
 * control would read `Present` and swallow the click, which is verbatim the
 * defect a fully cyclic Graph produced before its guard was split out.
 *
 * Neither half proves this on its own: the refusal is in Navigation and the
 * enablement is in `GraphSelector`, and what went wrong was that they disagreed.
 */
describe('presenting after explicit Layout creation', () => {
  const noLayouts: SpaceSnapshot = spaceSnapshotSchema.parse({
    ...snapshot,
    document: { version: 1, title: 'Space' },
  });

  it('offers no Present action while the created Layout’s Graph is empty', async () => {
    window.history.replaceState(
      null,
      '',
      `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
    );
    const session = mount(noLayouts);
    // Nothing to present before the conversion either: a Space with no Layouts
    // has no Graphs at all, so there is no Active Graph.
    expect(await screen.findByTestId('present-button')).toBeDisabled();

    const createLayout = await screen.findByRole('button', { name: 'Add Layout' });
    await waitFor(() => expect(createLayout).toBeEnabled());
    fireEvent.click(createLayout);

    // Explicit creation made a Layout active on its fresh empty Graph and left
    // existing Cards outside it for the Cards View.
    await waitFor(() =>
      expect(session.getState().working.document.layouts?.[0]?.graphs).toEqual([
        expect.objectContaining({ edges: [] }),
      ]),
    );
    const layoutId = session.getState().working.document.layouts?.[0]?.id;
    expect(layoutId).toBeDefined();
    await waitFor(() =>
      expect(window.location.pathname).toBe(
        `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(uuidSchema.parse(layoutId))}`,
      ),
    );
    expect(screen.getByTestId('present-button')).toBeDisabled();
    await settled(session);
  });

  it('offers Present on a Layout whose Active Graph holds an Edge', async () => {
    // The other half of the same control, and the reason it is here: the test
    // above passes just as well against a Present that is disabled always, so
    // on its own it cannot tell "refuses an empty Graph" from "refuses
    // everything". `snapshot`'s Layout owns one Graph with one Edge, which is
    // the smallest presentable Space.
    const session = mount(snapshot);

    expect(await screen.findByTestId('present-button')).toBeEnabled();
    await settled(session);
  });
});

describe('browser destination restoration', () => {
  /**
   * Mount writes no browser history entry, whatever the location says.
   *
   * Startup reads `window.location.pathname` once and composes the app from it,
   * and the `popstate` listener is registered by an effect *after* the sync
   * effect below it — so a Back that lands between the two leaves the location
   * somewhere the composed position does not name, with Navigation never told.
   * Correcting the location there would silently undo the reader's Back. The
   * pre-ADR-0081 code could not do this because it never wrote history on
   * mount, and neither may this one.
   */
  it('writes no history entry on mount, even where the location names another Space View', async () => {
    window.history.replaceState(
      null,
      '',
      `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
    );
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');

    const session = mount();
    await screen.findByTestId('selected-canvas');

    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe(
      `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
    );
    pushState.mockRestore();
    replaceState.mockRestore();
    await settled(session);
  });

  it('reports a destination that Back or Forward can no longer resolve', async () => {
    mount();
    const missingView = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
    window.history.replaceState(
      null,
      '',
      `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(missingView)}`,
    );

    fireEvent(window, new PopStateEvent('popstate'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Destination not found');
    expect(alert).toHaveTextContent('The requested address does not exist in this Space.');

    fireEvent.click(screen.getByRole('button', { name: 'Layout' }));

    await waitFor(() =>
      expect(screen.queryByText('Destination not found')).not.toBeInTheDocument(),
    );
  });

  /**
   * A cleared report and a corrected location are one thing, not two.
   *
   * The choice here is the row already current, so Navigation republishes the
   * same address and nothing about the position moves — and the location the
   * reader is still on is the one that could not be resolved, which reloads
   * into a host 404. Reporting it as answered while leaving it in the address
   * bar is the half-fix; the code this replaced could not do it, because the
   * one call that cleared the report was the call that wrote the location.
   */
  it('corrects the unresolved location when a repeated choice answers the report', async () => {
    const layoutView = `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(LAYOUT_ID)}`;
    window.history.replaceState(null, '', layoutView);
    const session = mount();
    await screen.findByTestId('selected-canvas');
    const missingView = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
    window.history.replaceState(
      null,
      '',
      `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(missingView)}`,
    );
    fireEvent(window, new PopStateEvent('popstate'));
    await screen.findByText('Destination not found');

    fireEvent.click(screen.getByRole('button', { name: 'Layout' }));

    await waitFor(() =>
      expect(screen.queryByText('Destination not found')).not.toBeInTheDocument(),
    );
    expect(window.location.pathname).toBe(layoutView);
    await settled(session);
  });

  it('clears a failed restoration after choosing a valid Graph', async () => {
    mount();
    const missingView = uuidSchema.parse('00000000-0000-4000-8000-000000000099');
    window.history.replaceState(
      null,
      '',
      `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(missingView)}`,
    );
    fireEvent(window, new PopStateEvent('popstate'));
    await screen.findByText('Destination not found');

    fireEvent.click(screen.getByRole('button', { name: 'Graph' }));

    await waitFor(() =>
      expect(screen.queryByText('Destination not found')).not.toBeInTheDocument(),
    );
  });

  /**
   * The wiring, not the rule (ADR 0081). What a self-Edge move deserves is
   * decided by `destinationSync` and proved over it in the node environment;
   * what this proves is that App asks that question and spends the answer on
   * the History API — a spy on `pushState` is the only way to see that from
   * here, and it is the only thing this asserts.
   *
   * Presenting a self-Edge is where the two answers differ. Entering the
   * presentation moves the address and earns its entry; advancing across the
   * self-Edge and retreating back out of it both grow and shrink the Traversal
   * history without moving the address, so neither takes another one. Both used
   * to push a duplicate entry, which is the behaviour ADR 0081 changed
   * deliberately.
   */
  it('takes one browser entry for a presentation a self-Edge never moves', async () => {
    mount(selfEdge);
    const pushState = vi.spyOn(window.history, 'pushState');

    fireEvent.click(await screen.findByRole('button', { name: 'Present' }));
    await waitFor(() => expect(pushState).toHaveBeenCalledTimes(1));
    const point = pushState.mock.calls[0]?.[2];
    expect(point).toBe(
      `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(LAYOUT_ID)}/graphs/${encodeCompactUuid(GRAPH_ID)}/present/${encodeCompactUuid(CARD_ID)}`,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));

    await waitFor(() => expect(screen.getByTestId('presenting-chrome')).toBeVisible());
    expect(pushState).toHaveBeenCalledTimes(1);
  });
});

/** Open Card A in place, then put its Markdown body under the caret. */
async function openEditor(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Open Card A' }));
  await screen.findByTestId('markdown-card-body-edit-target');
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A' }));
  await screen.findByRole('textbox', { name: 'Markdown source of A' });
}

describe('authoring an opened Card', () => {
  it('renames an Alias through the shared Title interaction and preserves Target content', async () => {
    const aliased = spaceSnapshotSchema.parse({
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
        {
          id: ALIAS_ID,
          document: {
            title: 'A again',
            kind: 'alias',
            target: CARD_ID,
          },
        },
      ],
    });
    const session = mount(aliased);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A again' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Card title' }), {
      target: { value: 'Recap' },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Card title' }), { key: 'Enter' });

    expect(session.getState().working.cards).toContainEqual(snapshot.cards[0]);
    expect(session.getState().working.cards).toContainEqual({
      ...aliased.cards[2],
      document: { ...aliased.cards[2]!.document, title: 'Recap' },
    });
    await settled(session);
  });

  /**
   * "Every place showing that content changes together" is the promise, and one
   * Alias cannot test it: reading the edit back through the target only says the
   * target was written. A second Alias is a second occurrence that has to have
   * moved with it, and it never touched the edit itself.
   */
  it('updates shared content only when its Target is opened explicitly', async () => {
    const session = mount(twiceAliased);

    await openEditor();
    replaceMarkdownSource('Written once, shown everywhere');
    fireEvent.click(screen.getByRole('button', { name: 'Save Card A' }));

    expect(bodyOf(session, CARD_ID)).toBe('Written once, shown everywhere');
    expect(session.getState().working.cards).toContainEqual(twiceAliased.cards[2]);
    expect(session.getState().working.cards).toContainEqual(twiceAliased.cards[3]);
    await settled(session);
  });

  it('opens each Alias on resolved Target content without a source editor', async () => {
    const session = mount(twiceAliased);

    fireEvent.click(await screen.findByRole('button', { name: 'Open Card A again' }));
    expect(await screen.findByText('A source')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /Markdown source/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Card A again' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Open Card A once more' }));
    expect(await screen.findByText('A source')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /Markdown source/ })).not.toBeInTheDocument();
    expect(bodyOf(session, CARD_ID)).toBe('A source');
    await settled(session);
  });

  /**
   * Escape cancels the body draft and returns the open Card to rendered Markdown.
   */
  it('cancels the edit on Escape without committing the draft', async () => {
    const session = mount();
    await openEditor();
    const source = replaceMarkdownSource('Draft nobody asked to lose');

    fireEvent.keyDown(source, { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'Markdown source of A' })).not.toBeInTheDocument();
    expect(screen.getByText('A source')).toBeVisible();
    expect(bodyOf(session, CARD_ID)).toBe('A source');
    await settled(session);
  });

  /**
   * Presenting draws the active Card's content *in place of* the Card
   * (`showActiveCardContent`), so a live editor cannot survive it and its draft
   * would go with none of ADR 0064's four exits spent. Rather than let a mode
   * change discard a document, presenting is unavailable while an edit runs and
   * the author settles it first.
   *
   * This is the one control outside the canvas that needs to know an edit is
   * running. The two modal surfaces need nothing: `CardPane` owns its own
   * modality, and the editor is still there when it closes.
   */
  it('cannot start presenting over a live content edit', async () => {
    const session = mount();
    await openEditor();
    expect(screen.getByRole('button', { name: 'Save Card A' })).toBeVisible();

    expect(screen.getByTestId('present-button')).toBeDisabled();
    fireEvent.click(screen.getByTestId('present-button'));

    expect(screen.getByRole('textbox', { name: 'Markdown source of A' })).toBeVisible();
    await settled(session);
  });

  it('presents once the author has settled the edit', async () => {
    const session = mount();
    await openEditor();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      key: 'Escape',
    });

    fireEvent.click(screen.getByTestId('present-button'));

    expect(screen.queryByRole('button', { name: /^Open Card/ })).not.toBeInTheDocument();
    await settled(session);
  });

  /**
   * Add Card finishes by putting a caret in the created Card's title editor, and
   * title editing is withdrawn while a content edit owns the keyboard (ADR
   * 0064). The canvas already withholds the `C` shortcut for that reason; the
   * toolbar reaches the same operation and had to agree, or one of the two paths
   * created a Card the author was never given the editor to name.
   */
  it('cannot add a Card over a live content edit', async () => {
    const session = mount();
    await openEditor();

    const addCard = screen.getByRole('button', { name: 'Add Card' });
    expect(addCard).toBeDisabled();
    fireEvent.click(addCard);

    expect(session.getState().working.cards).toHaveLength(2);
    await settled(session);
  });

  /**
   * Rename Layout begins a Space chrome title edit, and chrome title editing is
   * already withdrawn while a Card title editor owns the caret — so the menu
   * offered a Rename that began an edit the same render discarded, with a
   * Delete Layout beside it.
   */
  it('withdraws the Layout actions while a Card title editor is open', async () => {
    const session = mount();
    await settled(session);

    expect(
      screen.getByRole('button', { name: 'Actions for Space View Layout' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }));
    expect(await screen.findByRole('textbox', { name: 'Card title' })).toBeVisible();

    expect(
      screen.queryByRole('button', { name: 'Actions for Space View Layout' }),
    ).not.toBeInTheDocument();
    await settled(session);
  });

  it('adds a Card again once the author has settled the edit', async () => {
    const session = mount();
    await openEditor();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      key: 'Escape',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }));

    expect(session.getState().working.cards).toHaveLength(3);
    expect(await screen.findByRole('textbox', { name: 'Card title' })).toHaveValue('Card 1');
    await settled(session);
  });

  /**
   * The pane keeps its draft in `useState`, seeded once from the Card it was
   * mounted on. Opening a second Card without closing the first therefore had
   * the same React element in the same position — so the state survived while
   * `card.id` changed underneath it, and the fields were now A's text wearing
   * B's identity. `Done` then wrote A's title and body over B.
   *
   * The pane traps focus, but the invariant still has to survive an event from
   * a node behind it — including a synthetic or stale event delivered after the
   * pane opened.
   *
   * The node is found by its test id rather than by its heading, because the
   * pane hides the graph behind it from the accessibility tree (`hideOthers`,
   * ADR 0047) and a role query answers only what is in that tree. Dispatching
   * onto the element is still the point: this is a keypress reaching a node the
   * author cannot see.
   */
  it('never carries one Card’s draft onto another', async () => {
    const session = mount();
    await openEditor();
    replaceMarkdownSource('A rewritten');

    fireEvent.keyDown(screen.getByTestId(`rf__node-${OTHER_CARD_ID}`), { key: 'Enter' });

    // Whatever the pane shows, it must not be A's draft under B's id.
    expect(screen.getByRole('heading', { name: 'A' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Markdown source of A' })).toHaveTextContent(
      'A rewritten',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Card A' }));

    expect(cardTitleOf(session, OTHER_CARD_ID)).toBe('B');
    expect(bodyOf(session, OTHER_CARD_ID)).toBe('B source');
    await settled(session);
  });

  /**
   * A click outside the editor ends nothing; Escape still cancels from the source.
   */
  it('closes without committing when Escape is pressed outside the fields', async () => {
    const session = mount();
    await openEditor();
    replaceMarkdownSource('A rewritten');

    fireEvent.click(screen.getByTestId(`rf__node-${OTHER_CARD_ID}`));
    expect(screen.getByRole('textbox', { name: 'Markdown source of A' })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Markdown source of A' }), {
      key: 'Escape',
    });

    expect(screen.queryByRole('textbox', { name: 'Markdown source of A' })).not.toBeInTheDocument();
    expect(bodyOf(session, CARD_ID)).toBe('A source');
    await settled(session);
  });
});

/** The same Space with a Space Card placed beside the two Markdown Cards (ADR 0068). */
const withSpaceCard: SpaceSnapshot = spaceSnapshotSchema.parse({
  ...snapshot,
  document: {
    ...snapshot.document,
    layouts: [
      {
        ...snapshot.document.layouts![0]!,
        positions: {
          ...snapshot.document.layouts![0]!.positions,
          [SPACE_CARD_ID]: { x: 600, y: 20, open: false },
        },
      },
    ],
  },
  cards: [
    ...snapshot.cards,
    { id: SPACE_CARD_ID, document: { title: 'Nested', kind: 'space', spaceId: TARGET_SPACE_ID } },
  ],
});

/** What a Layout records for one Card, which is where Open is authored (ADR 0064). */
const placementOf = (session: SpaceSession, cardId: CardId): LayoutPosition | undefined =>
  (session.getState().working.document.layouts ?? [])[0]?.positions[cardId];

describe('the Card affordance on the graph', () => {
  /**
   * Opening is a Layout-owned Edit, and the strategies, the placement and the
   * projection each read `open` without asking what kind the Card is. A kind
   * with nothing to draw Open must therefore never reach that state: the Card
   * would take its Open rect in the placement, displace its `+x`/`+y`
   * neighbours, and still be drawn Closed with no control to close it.
   */
  it('does not Open a Space Card, which has no Open body to draw', async () => {
    const session = mount(withSpaceCard);
    const before = placementOf(session, SPACE_CARD_ID);

    fireEvent.keyDown(await screen.findByTestId(`rf__node-${SPACE_CARD_ID}`), { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('Nested')).toBeVisible());
    expect(placementOf(session, SPACE_CARD_ID)).toEqual(before);
    expect(screen.queryByRole('button', { name: 'Close Card Nested' })).not.toBeInTheDocument();
    await settled(session);
  });

  it('opens the Card on rendered Markdown in place', async () => {
    const session = mount();

    fireEvent.click(await screen.findByRole('button', { name: 'Open Card A' }));
    expect(await screen.findByText('A source')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Markdown source of A' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Card A' })).toBeVisible();
    await settled(session);
  });

  /**
   * No gesture on a Card's body opens it (ADR 0036); the Title and Opening each
   * have their own explicit control.
   */
  it('is the only pointer graph in — the Card body opens nothing', async () => {
    const session = mount();
    const card = (await screen.findByRole('heading', { name: 'A' })).closest('.react-flow__node');
    if (card === null) throw new Error('Card A is not drawn as a node');

    fireEvent.click(card);
    fireEvent.doubleClick(card);

    // The authored Open state itself, and the control an Open Card offers. The
    // Card the gesture lands on is the evidence: a pane that is no longer built
    // cannot be absent from the document for a reason this test is about.
    expect(screen.getByRole('article', { name: 'A' })).toHaveAttribute('data-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Close Card A' })).not.toBeInTheDocument();
    await settled(session);
  });
});
