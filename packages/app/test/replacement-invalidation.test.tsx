import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  type RenderResult,
} from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { spaceSnapshotSchema, uuidSchema, type SpaceSnapshot } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { MemorySpaceBackend, openSpaceSession, type SpaceSession } from '@project/persistence';
import { mountSpaceApp } from '../src/SpaceApp';

/**
 * ADR 0042's "one shared contract test": an Interaction draft open when a stored
 * Space is accepted is discarded with the Space it named.
 *
 * Three surfaces own a draft the author can actually reach today — the graph's
 * inline title field, the opened-Card pane, and React Flow's drag — and no one
 * mechanism discards all three. Nothing held them to any of it before this file,
 * so all three held by construction and by reading.
 *
 * **This is a characterization test: it pins outcomes that already hold.**
 * `.scratch/interaction-draft-invalidation/issues/02-…` carries the argument. So
 * that nobody has to take the coverage on trust, each case was mutation-checked
 * against three deliberate breakages, and what follows is what was measured
 * rather than what was reasoned:
 *
 * - **K** — delete `key={authoringState.replacementEpoch}` from `App.tsx`.
 * - **R** — stop the render adapter's epoch subscriber clearing
 *   `projection`/`dragOrigins`/`selection` (`render-adapter.ts`).
 * - **N** — make `navigation.openFresh` retain `openedCardId`.
 *
 * | case | K | R | K+R | N |
 * |---|---|---|---|---|
 * | opened-Card pane | passes | passes | passes | **fails** |
 * | in-flight drag | passes | **fails** | **fails** | passes |
 *
 * **The inline title field is not covered here, and cannot be.** The only
 * trigger the app has for accepting a stored Space is the conflict banner's
 * `Accept remote`, which now lives in a modal `AlertDialog`. Raising the
 * conflict traps focus into that dialog, the field blurs, and blur is the
 * editor's own commit — so the draft is *committed* before the replacement
 * lands, and there is no open draft left for the replacement to discard. That
 * is the app's real behaviour through its real trigger, not a harness artifact;
 * whether an arriving conflict should commit an in-progress rename is a product
 * question, and it is recorded in the ticket rather than frozen here.
 *
 * `K` is therefore defended by nothing, here or anywhere: the canvas key and the
 * projection reset are each sufficient for the drafts inside the canvas subtree,
 * and with the title field unreachable only the drag distinguishes them — which
 * `R` alone already kills.
 *
 * What is deliberately **not** asserted: that the discard is silent, and where
 * focus lands afterwards. Both are open product questions recorded in that
 * ticket's Comments, and a test that pinned either would freeze an answer nobody
 * has given.
 */

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');

/**
 * One positioned Card in a Layout that owns one empty Graph — the smallest Space
 * that draws a Card, and one Card has nothing to connect (ADR 0040).
 *
 * The local and remote snapshots below share every identity and differ only in
 * their values. That is the point: a draft naming a Card the replacement no
 * longer holds would be discarded by the lookup failing, which proves nothing.
 * Here the Card the author was editing still exists, still under the same id,
 * and the draft must go anyway.
 */
const snapshot = (
  title: string,
  cardTitle: string,
  body: string,
  x: number,
  y: number,
): SpaceSnapshot =>
  spaceSnapshotSchema.parse({
    id: SPACE_ID,
    document: {
      version: 1,
      title,
      layouts: [
        {
          id: LAYOUT_ID,
          title: 'Layout',
          kind: 'positioned',
          positions: { [CARD_ID]: { x, y } },
          graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
        },
      ],
      defaultRenderer: LAYOUT_ID,
    },
    cards: [{ id: CARD_ID, document: { title: cardTitle, kind: 'markdown', body } }],
  });

const LOCAL = snapshot('Local space', 'Local card', 'Local source', 10, 20);
const REMOTE = snapshot('Remote space', 'Remote card', 'Remote source', 900, 700);

const runtime = (value: SpaceSnapshot) => {
  const loaded = loadSpaceSnapshot(value);
  if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'));
  return loaded.space;
};

/**
 * A mounted Space app over a session whose stored Space has already moved to
 * `REMOTE`, but which has not yet discovered that.
 *
 * The conflict is raised *after* the draft is open rather than before, and the
 * order is load-bearing: a conflicted session draws its `Accept remote` in a
 * modal AlertDialog that marks the rest of the shell inert, so a Space app
 * mounted already-conflicted has no reachable Card to open a draft on.
 */
async function mountedSpaceApp(): Promise<SpaceSession> {
  const backend = new MemorySpaceBackend([
    { snapshot: REMOTE, revision: 4n, exportedRevision: null },
  ]);
  const session = openSpaceSession(backend, {
    snapshot: LOCAL,
    revision: 3n,
    exportedRevision: null,
  });

  let view: RenderResult | undefined;
  mountSpaceApp({ space: runtime(LOCAL), spaceSession: session }, (app) => {
    if (view === undefined) view = render(app);
    else view.rerender(app);
  });
  // Placement is asynchronous, so the Card arrives after the mount rather than
  // with it. Every draft below starts from a drawn Card.
  await screen.findByRole('heading', { name: 'Local card' });
  return session;
}

/**
 * Discover the conflict with the draft already open: a commit against the
 * revision this session acknowledged, which the backend has moved past.
 */
const raiseConflict = async (session: SpaceSession): Promise<void> => {
  session.submit(LOCAL);
  await waitFor(() => expect(session.getState().persistence.kind).toBe('conflicted'));
  await screen.findByTestId('persistence-accept-remote');
};

const acceptRemote = (): void => {
  fireEvent.click(screen.getByTestId('persistence-accept-remote'));
};

/**
 * The accepted Space is the one on screen — read off the shell's title, which is
 * the Space's own name and the one thing the replacement renames that no
 * draft, Card or placement is involved in.
 *
 * Waited for *before* each draft assertion so that a surviving draft fails on the
 * assertion naming it, rather than on some later expectation that could not find
 * the Card the open editor was covering.
 */
const replacementLanded = async (): Promise<void> => {
  expect(await screen.findByText('Remote space')).toBeVisible();
};

const nodeOf = (id: string): HTMLElement => {
  const node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
  if (node === null) throw new Error(`No node is drawn for ${id}.`);
  return node;
};

/**
 * Begin a real React Flow node drag and leave it in flight — pointer down, two
 * moves, no release.
 *
 * React Flow drags through d3-drag, which reads `event.view` to bind its own
 * move listeners. Testing Library builds a `MouseEvent` whose `view` is null and
 * jsdom refuses one passed through `MouseEventInit`, so the property is defined
 * on the constructed event instead. Without it d3 throws inside the listener,
 * which jsdom reports as an uncaught exception rather than a failing assertion —
 * the test then passes and the run exits 1.
 */
const withView = <E extends Event>(event: E, view: Window): E => {
  Object.defineProperty(event, 'view', { value: view, configurable: true });
  return event;
};

function beginDrag(node: HTMLElement): void {
  const view = node.ownerDocument.defaultView;
  if (view === null) throw new Error('The drag needs a window to bind its move listeners to.');
  fireEvent(
    node,
    withView(createEvent.mouseDown(node, { clientX: 0, clientY: 0, buttons: 1 }), view),
  );
  fireEvent(
    view,
    withView(createEvent.mouseMove(view, { clientX: 120, clientY: 60, buttons: 1 }), view),
  );
  fireEvent(
    view,
    withView(createEvent.mouseMove(view, { clientX: 240, clientY: 120, buttons: 1 }), view),
  );
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
});

afterAll(() => vi.unstubAllGlobals());

/**
 * Release any gesture a test left in flight.
 *
 * d3-drag binds `mousemove.drag`/`mouseup.drag` to the **window** and removes
 * them only from its own `mouseupped`, and XYDrag's autopan
 * `requestAnimationFrame` loop is cancelled only by that same release. So a test
 * that ends mid-drag — which the drag case below does deliberately — leaves both
 * running for the rest of the file.
 *
 * Neither can reach another test file: vitest isolates one jsdom per file. And
 * the next gesture's `mousedown` rebinds the same d3 names over the stale ones,
 * so a later test in this file would not inherit them either. This is here so
 * that a third test added below inherits a quiet window rather than that
 * argument, and it asserts nothing — the drag case makes its own claims before
 * this runs.
 */
afterEach(() => {
  fireEvent(window, withView(createEvent.mouseUp(window, { clientX: 240, clientY: 120 }), window));
});

describe('accepting a stored Space discards the open Interaction draft', () => {
  /**
   * The opened-Card pane (`OpenCard`), which holds the largest draft in the app —
   * a title and a body of Markdown (`MarkdownDraft`).
   *
   * It renders outside the keyed canvas subtree and carries no key of its own, so
   * neither the canvas key nor the placeholder branch that unmounts the
   * `ReactFlowProvider` subtree reaches it. What discards it is `acceptStoredSpace`
   * calling `navigation.openFresh`, which republishes Navigation whole with no
   * opened Card.
   *
   * The editor's own state is keyed by the content Card's id, which survives the
   * replacement — so a pane that stayed open would keep this draft rather than
   * reseed from the accepted Card.
   */
  it('closes an opened Card whose editor holds an uncompleted draft', async () => {
    const session = await mountedSpaceApp();
    fireEvent.click(screen.getByRole('button', { name: 'Open Card Local card' }));
    const source = await screen.findByRole('textbox', { name: 'Markdown source' });
    source.focus();
    fireEvent.keyDown(source, { key: 'a', ctrlKey: true });
    fireEvent.paste(source, {
      clipboardData: { getData: () => 'Prose nobody pressed Done on' },
    });
    expect(source).toHaveTextContent('Prose nobody pressed Done on');

    await raiseConflict(session);
    acceptRemote();

    await replacementLanded();
    expect(screen.queryByTestId('open-card')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Prose nobody pressed Done on')).not.toBeInTheDocument();
    expect(session.getState().working).toEqual(REMOTE);
    expect(await screen.findByRole('heading', { name: 'Remote card' })).toBeVisible();
  });

  /**
   * React Flow's drag attempt, which ADR 0042 names alongside the title fields.
   *
   * A drag in flight is a draft in two places at once: the render adapter's
   * `dragOrigins` and the live node's position, which has left its authored
   * place and has not been written anywhere. Accepting replaces both — the Card
   * is drawn where the accepted Space authored it, not where the pointer left
   * it — and no `settled-card-movement` Edit is derived from a gesture that
   * never settled.
   *
   * The one case here that a single mutation breaks, and the reason is
   * `reconcile`: a surviving Card takes its position from the *live* node, so a
   * render adapter that kept its projection across the replacement would go on
   * drawing this Card where the pointer left it, under the accepted Space's
   * title. The unmount cannot cover that — it is a store the unmount does not
   * reach.
   *
   * The drag is left in flight on purpose and released by the `afterEach` above
   * rather than here, because releasing it is not part of what this pins. What a
   * late release *would* do was measured separately and is inert: no settled
   * change is emitted after the replacement, so no `settled-card-movement`
   * completion is derived and `working` does not move. That is React Flow's
   * doing, not ours — `render-adapter.ts:249` falls back to `beforeById` when
   * `dragOrigins` is empty, so nothing here refuses a stale settled change. The
   * ticket's section 5 has the bisection and treats it as an open question.
   */
  it('drops an in-flight drag and redraws the Card where the accepted Space places it', async () => {
    const session = await mountedSpaceApp();
    const dragged = nodeOf(CARD_ID);
    expect(dragged).toHaveStyle({ transform: 'translate(10px,20px)' });

    beginDrag(dragged);
    // The exact offset the two moves applied, asserted rather than merely "not
    // where it started": a drag that silently failed to begin would satisfy the
    // discard below for the wrong reason, and this file's whole subject is
    // outcomes that hold for reasons nobody chose.
    expect(dragged).toHaveStyle({ transform: 'translate(130px,80px)' });

    await raiseConflict(session);
    acceptRemote();

    await replacementLanded();
    await waitFor(() =>
      expect(nodeOf(CARD_ID)).toHaveStyle({ transform: 'translate(900px,700px)' }),
    );
    expect(session.getState().working).toEqual(REMOTE);
    expect(await screen.findByRole('heading', { name: 'Remote card' })).toBeVisible();
  });
});
