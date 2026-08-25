import { fireEvent, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
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
        positions: { [CARD_ID]: { x: 10, y: 20 }, [OTHER_CARD_ID]: { x: 300, y: 20 } },
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
          [ALIAS_ID]: { x: 600, y: 20 },
          [SECOND_ALIAS_ID]: { x: 900, y: 20 },
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
describe('presenting after a conversion', () => {
  const noLayouts: SpaceSnapshot = spaceSnapshotSchema.parse({
    ...snapshot,
    document: { version: 1, title: 'Space' },
  });

  it('offers no Present action while the converted Layout’s Graph is empty', async () => {
    const session = mount(noLayouts);
    // Nothing to present before the conversion either: a Space with no Layouts
    // has no Graphs at all, so there is no Active Graph.
    expect(await screen.findByTestId('present-button')).toBeDisabled();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Title A' }));
    const input = screen.getByRole('textbox', { name: 'Card title' });
    fireEvent.change(input, { target: { value: 'Renamed A' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // The Edit converted: there is a Layout now, and it is active on the empty
    // Graph the conversion minted for it.
    await waitFor(() =>
      expect(session.getState().working.document.layouts?.[0]?.graphs).toEqual([
        expect.objectContaining({ edges: [] }),
      ]),
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

/** Open Card A in place, then put its Markdown body under the caret. */
async function openEditor(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Open Card A' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Card A' }));
  await screen.findByRole('textbox', { name: 'Markdown source of A' });
}

describe('authoring an opened Card', () => {
  it('updates only Alias metadata and preserves the Target content', async () => {
    const aliased = spaceSnapshotSchema.parse({
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

    fireEvent.click(await screen.findByRole('button', { name: 'Open Card A again' }));
    await screen.findByTestId('open-card');
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('A again');
    expect(screen.queryByRole('textbox', { name: /Markdown source/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Recap' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

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

  /**
   * Each Alias owns its metadata draft. Nothing typed into the first and
   * abandoned may appear in the second.
   */
  it('opens a second Alias on its own metadata, not the draft abandoned in the first', async () => {
    const session = mount(twiceAliased);

    fireEvent.click(await screen.findByRole('button', { name: 'Open Card A again' }));
    await screen.findByTestId('open-card');
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Never completed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Open Card A once more' }));
    await screen.findByTestId('open-card');

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('A once more');
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
   * Presenting is read-only, and the reason no Edit action survives into it is
   * that no opened Card does: starting traversal closes whatever was open, and
   * the graph refuses to open a Card while presenting. `OpenCard` is handed its
   * Edit action without being told the mode, so this is the guarantee that keeps
   * that honest, and it is a long way from the component relying on it.
   */
  it('leaves no opened Card, and so no Edit action, once presenting starts', async () => {
    const session = mount();
    await openEditor();
    expect(screen.getByRole('button', { name: 'Save Card A' })).toBeVisible();

    fireEvent.click(screen.getByTestId('present-button'));

    expect(screen.queryByRole('textbox', { name: 'Markdown source of A' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Open Card/ })).not.toBeInTheDocument();
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

describe('the Card affordance on the graph', () => {
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

    expect(screen.queryByTestId('open-card')).not.toBeInTheDocument();
    await settled(session);
  });
});
