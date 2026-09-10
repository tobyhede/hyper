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
import { MemorySpaceBackend, type SpaceSession } from '@project/persistence';
import { mountSpace } from './space-mounting';
import { composeApp } from '../src/compose-app';
import { openTestSpace } from './opened-space';
import { beginRename } from './command-dock';

/**
 * ADR 0042's "one shared contract test": an Interaction draft open when a stored
 * Space is accepted is discarded with the Space it named.
 *
 * Three surfaces own a draft the author can actually reach today — the graph's
 * inline title field, the opened-Card pane, and React Flow's drag — and no one
 * mechanism discards all three. Nothing held them to any of it before this file,
 * so all three held by construction and by reading.
 *
 * **Two of the three cases are characterization: they pin outcomes that already
 * held.** The third is not. The Layout rename below was written as
 * characterization too and was never entitled to be: the chrome editor is the
 * Dock name control's own state, no mechanism here reached it, and the case
 * passed only on the runs where the conflict's modal stole the caret and blur
 * committed the draft before the accept. `IdentityName` now ends a rename on the
 * replacement epoch, and the case stages a draft the rename refuses so the
 * assertion no longer turns on where jsdom put focus.
 * `.scratch/interaction-draft-invalidation/issues/02-…` carries the argument. So
 * that nobody has to take the coverage on trust, each case was mutation-checked
 * against three deliberate breakages, and what follows is what was measured
 * rather than what was reasoned:
 *
 * - **K** — delete `key={authoringState.replacementEpoch}` from `App.tsx`.
 * - **R** — stop the render adapter's epoch subscriber clearing
 *   `projection`/`dragOrigins`/`selection` (`render-adapter.ts`).
 * - **N** — make `navigation.openFresh` retain the previous Space's navigation.
 *
 * | case | K | R | K+R | N |
 * |---|---|---|---|---|
 * | opened-Card pane | passes | passes | passes | **fails** |
 * | in-flight drag | passes | **fails** | **fails** | passes |
 *
 * **What the modal does to a draft is the hazard this file kept walking into.**
 * The only trigger the app has for accepting a stored Space is the conflict
 * banner's `Accept remote`, which lives in a modal `AlertDialog`. Raising the
 * conflict traps focus into that dialog, the field blurs, and blur is
 * `InlineTitleEditor`'s own commit — so a draft the rename would *accept* is
 * committed before the replacement lands and there is nothing left to discard.
 * That is the app's real behaviour through its real trigger, not a harness
 * artifact; whether an arriving conflict should commit an in-progress rename is
 * a product question, and it is recorded in the ticket rather than frozen here.
 * A draft the rename **refuses** is held open and editable by contract, which is
 * why the chrome case below stages one: it is the draft that survives the trap
 * either way, so what the assertion reads is the replacement and nothing else.
 *
 * `K` is defended by nothing, here or anywhere: the canvas key and the
 * projection reset are each sufficient for the drafts inside the canvas subtree,
 * and only the drag distinguishes them — which `R` alone already kills. The
 * chrome rename is outside that subtree and outside `K`'s reach entirely.
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
  layoutTitle: string,
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
          title: layoutTitle,
          kind: 'positioned',
          positions: { [CARD_ID]: { x, y, open: false } },
          graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
        },
      ],
      defaultLayout: LAYOUT_ID,
    },
    cards: [{ id: CARD_ID, document: { title: cardTitle, kind: 'markdown', body } }],
  });

const LOCAL = snapshot('Local space', 'Local layout', 'Local card', 'Local source', 10, 20);
const REMOTE = snapshot('Remote space', 'Remote layout', 'Remote card', 'Remote source', 900, 700);

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
  const { spaceSession: session, spaceCards } = openTestSpace(backend, {
    snapshot: LOCAL,
    revision: 3n,
    exportedRevision: null,
  });

  let view: RenderResult | undefined;
  mountSpace(
    { id: runtime(LOCAL).id, session, app: composeApp({ spaceSession: session }), spaceCards },
    (app) => {
      if (view === undefined) view = render(app);
      else view.rerender(app);
    },
  );
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
   * The inline Title draft lives inside the Canvas Card. Replacement remounts
   * the keyed canvas subtree, so neither its caret nor its uncompleted value can
   * cross into the new Space. An open Markdown draft cannot be staged against
   * this fixture: opening is itself an authored commit and therefore raises the
   * fixture's deliberately waiting conflict before body editing can begin.
   */
  it('discards a Card title editor holding an uncompleted draft', async () => {
    const session = await mountedSpaceApp();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Title Local card' }));
    const title = screen.getByRole('textbox', { name: 'Card title' });
    fireEvent.change(title, {
      target: { value: 'Title nobody pressed Enter on' },
    });
    expect(title).toHaveValue('Title nobody pressed Enter on');

    await raiseConflict(session);
    acceptRemote();

    await replacementLanded();
    expect(screen.queryByRole('textbox', { name: 'Card title' })).not.toBeInTheDocument();
    expect(screen.queryByText('Title nobody pressed Enter on')).not.toBeInTheDocument();
    expect(session.getState().working).toEqual(REMOTE);
    expect(await screen.findByRole('heading', { name: 'Remote card' })).toBeVisible();
  });

  /**
   * The Space chrome's own title draft, which lives outside the keyed canvas
   * subtree and so is reached by none of the mechanisms above. A Layout rename
   * left uncompleted names a Layout the accepted Space may not hold, and
   * completing it afterwards writes against whatever Layout now resolves.
   *
   * **The draft is one the rename refuses, and that is what makes this test say
   * anything.** It was a typed name before, and the assertion passed or failed
   * on where the conflict's modal put the caret: `AlertDialog` traps focus, the
   * field blurs, and blur is `InlineTitleEditor`'s own commit — so on the runs
   * where the trap reached the field the draft was *committed* before the accept
   * and the replacement had nothing left to discard. The editor survived on
   * every other run, which is the defect this now pins. A blank name is the one
   * refusal every renameable entity has (`IdentityName`), and a refused draft is
   * held open and editable by contract — so the editor is still standing when
   * the accept lands whether the trap reached it or not, and the assertion is
   * about the replacement rather than about jsdom's focus.
   *
   * `hidden: true` throughout for the same reason: a conflicted shell is
   * `aria-hidden` behind the modal, so an accessibility-tree query answers
   * "gone" for an editor that is still mounted, and the discard would read as
   * proved by the dialog that hid it.
   */
  it('discards a Layout rename left open when the stored Space is accepted', async () => {
    const session = await mountedSpaceApp();
    await beginRename('selected-canvas');
    const name = screen.getByRole('textbox', { name: 'Layout name' });
    fireEvent.change(name, { target: { value: '   ' } });
    expect(name).toHaveValue('   ');

    await raiseConflict(session);
    // The staged pre-condition, asserted rather than assumed: without an open
    // editor here the discard below is vacuous, which is exactly how this case
    // passed while the editor was surviving.
    expect(screen.getByRole('textbox', { name: 'Layout name', hidden: true })).toHaveValue('   ');
    acceptRemote();

    await replacementLanded();
    expect(
      screen.queryByRole('textbox', { name: 'Layout name', hidden: true }),
    ).not.toBeInTheDocument();
    // And the cluster is back to naming the Layout the accepted Space authored,
    // rather than an editor reseeded from it.
    expect(await screen.findByTestId('selected-canvas')).toHaveTextContent('Remote layout');
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
