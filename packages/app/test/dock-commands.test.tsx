import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Application } from '../src/components/Application';
import { MemorySpaceBackendTestControl } from '@project/persistence';
import { storyOpening, storySpaces } from '../stories/support/application';
import {
  metaSnapshot,
  commandDockSnapshot,
  platformSnapshot,
  designSystemSnapshot,
  traversalSnapshot,
  authoredSnapshot,
  deepDiveSnapshot,
} from '../stories/support/spaces';
import { Default, SaveFailedElsewhere } from '../stories/space/command-dock.stories';

// The shared reading of "unavailable": ADR 0073 keeps a toolbar item focusable
// while it is withdrawn, so `aria-disabled` is the attribute and `toBeDisabled`
// would call every one of them available.
import { unavailable } from './command-dock';

/**
 * What the Command Dock owes an author, held over the application the catalogue mounts.
 *
 * Three of ADR 0082's obligations and one of ADR 0073's are assertable without
 * a browser, and each of them is a claim the prototype failed before this file
 * existed: a Card could only be placed by dragging it, the Open Spaces menu's
 * accessible name did not contain the word on its face, and the bar was four
 * toolbars where the ADR draws one.
 *
 * The story is mounted whole rather than through a harness of its own. It is
 * the thing under review — `Default` composes the real Space, the production
 * canvas and the Dock over it — and a second assembly beside it would be a
 * surface this file could get right while the catalogue's stayed wrong.
 */

async function renderDock(view: ReactElement): Promise<void> {
  await act(() => {
    render(view);
    return Promise.resolve();
  });
  await waitFor(() =>
    expect(within(dock()).getByRole('button', { name: /^Rename Diagram:/ })).toBeInTheDocument(),
  );
}

/** jsdom ships none, and React Flow observes its own container. */
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

/**
 * jsdom implements no pointer capture, and the grip claims it on every press.
 * Installed rather than stubbed per test, because it is a gap in the
 * environment like `ResizeObserver` above rather than a collaborator any test
 * here has an opinion about.
 */
beforeAll(() => {
  Element.prototype.setPointerCapture = function setPointerCapture(): void {
    return undefined;
  };
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {
    return undefined;
  };
});

/**
 * The other half of the same gap: jsdom ships no `PointerEvent` **class**, so
 * Testing Library falls back to a `MouseEvent` and every field that only a
 * pointer event carries — `pointerId`, `isPrimary` — is dropped by the
 * constructor without a word. The grip reads both to decide whether a press is
 * its own, so an environment that cannot carry them is an environment in which
 * every gesture here reads as the same anonymous press.
 *
 * A subclass of the environment's own `MouseEvent` rather than an event written
 * from scratch: the mouse half is jsdom's and correct, and the three fields
 * below are the whole of what is missing.
 */
class PointerEventPolyfill extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.isPrimary = init.isPrimary ?? false;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

beforeAll(() => vi.stubGlobal('PointerEvent', PointerEventPolyfill));

afterAll(() => vi.unstubAllGlobals());

/** The bar, named as its own toolbar — everything below is scoped to it. */
const dock = (): HTMLElement => screen.getByRole('toolbar', { name: 'Command Dock' });

/**
 * What a sighted reader sees on a control, which is what its name has to
 * contain.
 *
 * `textContent` and not the accessibility tree: the glyphs beside a name are
 * `aria-hidden` or carry their own `role="img"` label, so neither contributes a
 * word to the label a reader would speak. What is left is the visible text.
 */
const visibleLabel = (control: HTMLElement): string => control.textContent.trim();

/** What assistive technology announces, which `aria-label` decides where it is set. */
const accessibleName = (control: HTMLElement): string =>
  control.getAttribute('aria-label') ?? visibleLabel(control);

describe('placing a Card into a Diagram without a pointer (ADR 0082)', () => {
  /**
   * The rows were `<div draggable>` — no role, no tab stop, no activation — so
   * an HTML5 drag was the only way to add a Card to the Diagram. ADR 0082 says a
   * drag may be *a* way and never the only one.
   */
  it('offers each Card in the list as a focusable button', async () => {
    await renderDock(<Default />);
    fireEvent.click(within(dock()).getByRole('button', { name: 'Cards' }));

    const row = screen.getByRole('button', { name: 'Add Constraints to Diagram' });

    // A native button rather than a `div` wearing a role: Enter and Space
    // activating one is the platform's, and jsdom does not synthesise that
    // activation, so what a node test can hold is that the control is the kind
    // the browser activates.
    expect(row.tagName).toBe('BUTTON');
    row.focus();
    expect(document.activeElement).toBe(row);
  });

  /**
   * **The same completion, not a parallel one.** Activating a row spends the
   * `onPlace` the canvas's own `onDrop` spends, so the Card lands on the
   * selected Diagram and the canvas draws it — which is the observable a drop
   * would have produced.
   */
  it('adds the Card to the drawing Diagram, as the drop does', async () => {
    await renderDock(<Default />);
    fireEvent.click(within(dock()).getByRole('button', { name: 'Cards' }));

    // `Collection 1` places five of the fixture's Cards and `Constraints` is
    // not one of them. The canvas resolves its placement asynchronously, so the
    // count is waited for rather than read on the spot.
    const placed = (): number =>
      [...document.querySelectorAll('[data-testid^="rf__node-"]')].filter(
        (node) => node.closest('[hidden]') === null,
      ).length;
    await waitFor(() => expect(placed()).toBe(5));

    fireEvent.click(screen.getByRole('button', { name: 'Add Constraints to Diagram' }));

    await waitFor(() => expect(placed()).toBe(6));
    // The list is not dismissed by the placement: adding several Cards costs
    // one disclosure, exactly as the drag out of it does.
    expect(screen.getByRole('button', { name: 'Add Prior art to Diagram' })).toBeInTheDocument();
  });
});

describe("every control's accessible name contains its visible label (WCAG 2.5.3)", () => {
  /**
   * The Open Spaces menu is the control this rule was written down for: it showed
   * `Spaces` under `aria-label="Switch Space. N open."`, so speech input could
   * not reach the word on its face. It is one token now, spent in both places.
   */
  it('names the root Open Spaces menu with the word it shows', async () => {
    await renderDock(<Default />);
    // Three crossings in, the Open Spaces menu is a bare chevron; the word is what the
    // root draws. Walk up to it, which is what the parent step is for.
    await act(() => {
      fireEvent.click(within(dock()).getByRole('button', { name: 'Go to Design system' }));
      return Promise.resolve();
    });
    await act(() => {
      fireEvent.click(within(dock()).getByRole('button', { name: 'Go to Platform' }));
      return Promise.resolve();
    });
    await act(() => {
      fireEvent.click(within(dock()).getByRole('button', { name: 'Go to Meta Space' }));
      return Promise.resolve();
    });

    const openSpacesMenu = within(dock()).getByRole('button', { name: /^Spaces\./ });

    expect(visibleLabel(openSpacesMenu)).toBe('Spaces');
    expect(accessibleName(openSpacesMenu)).toContain(visibleLabel(openSpacesMenu));
  });

  /**
   * And the rule over the whole bar rather than the one control that broke it.
   * A control with no words on it owes nothing here; every one that carries
   * them owes its name.
   */
  it('holds every named control in the bar to it', async () => {
    await renderDock(<Default />);

    const labelled = within(dock())
      .getAllByRole('button')
      .filter((control) => visibleLabel(control) !== '');

    expect(labelled.length).toBeGreaterThan(0);
    for (const control of labelled) {
      expect(accessibleName(control).toLowerCase()).toContain(visibleLabel(control).toLowerCase());
    }
  });
});

describe('the bar is one toolbar with named groups (ADR 0073)', () => {
  /**
   * Four `Toolbar` roots is four tab stops, where the ADR draws one root whose
   * arrows move between every command in it. The groups are what assistive
   * technology announces on the way past instead.
   */
  it('draws one root and four named groups inside it', async () => {
    await renderDock(<Default />);

    const groups = within(dock()).getAllByRole('group');

    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Space',
      'Diagram',
      'Graph',
      'Cards',
    ]);
    // No toolbar inside the toolbar: the clusters are groups now.
    expect(within(dock()).queryAllByRole('toolbar')).toHaveLength(0);
  });

  /**
   * The breadcrumb's two controls are the ones that could not be toolbar items
   * while each cluster owned its own root, so they were plain Buttons and each
   * took a tab stop. They are items now, which is what makes the bar one.
   */
  it('keeps the way back inside the same roving order', async () => {
    await renderDock(<Default />);

    const parent = within(dock()).getByRole('button', { name: 'Go to Design system' });

    expect(parent.closest('[role="toolbar"]')).toBe(dock());
  });
});

/**
 * The press the grip answers: the primary button of the primary pointer.
 *
 * Written out rather than left to the event's own defaults because the grip
 * now reads all three fields, and a gesture that does not say which pointer
 * pressed it is a gesture no reader of this file can check against the guard.
 */
const PRIMARY = { pointerId: 1, button: 0, isPrimary: true } as const;

/** The frame the slot decides and the drag moves, which is what a gesture shows on. */
const frame = (): HTMLElement => {
  const value = dock().closest('[data-testid="command-dock"]');
  if (!(value instanceof HTMLElement)) throw new Error('The Dock has no frame');
  return value;
};

describe('the grip discloses the twelve slots (ADR 0082)', () => {
  /**
   * The grip is no longer a `Menu.Trigger`: Base UI opens one on `mousedown`,
   * which is the first pixel of the drag, and the deferral that stood here was
   * built on a guard that does not exist. It is a plain toolbar button with one
   * `onClick`, and the menu positions against it through `anchor`.
   */
  it('opens the slot menu from one activation', async () => {
    await renderDock(<Default />);
    const grip = within(dock()).getByRole('button', { name: /^Move Command Dock\./ });

    expect(grip).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(grip);

    const menu = screen.getByRole('menu');
    // Four edges, three stops each — the set `dock-slots.test.ts` holds to a
    // round trip, offered here as radio items marked at the one it is in.
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(12);
    expect(grip).toHaveAttribute('aria-expanded', 'true');
  });

  /** Choosing a slot is what the drag chooses, and the edge decides the shape. */
  it('redocks the surface to a chosen slot', async () => {
    await renderDock(<Default />);
    fireEvent.click(within(dock()).getByRole('button', { name: /^Move Command Dock\./ }));

    // `Middle` is the vertical edges' centre stop, and both of them offer one,
    // so the first is the right edge's — either redocks the bar to a column.
    const [middle] = within(screen.getByRole('menu')).getAllByRole('menuitemradio', {
      name: 'Middle',
    });
    if (middle === undefined) throw new Error('The slot menu offers no Middle stop.');
    fireEvent.click(middle);

    expect(dock()).toHaveAttribute('data-orientation', 'vertical');
  });

  /**
   * With no trigger there is nothing for the popup to hand focus back to, so
   * the grip is named as the popup's `finalFocus` — otherwise dismissing the
   * list drops the reader on the document body.
   */
  it('returns focus to the grip when the list is dismissed', async () => {
    await renderDock(<Default />);
    const grip = within(dock()).getByRole('button', { name: /^Move Command Dock\./ });
    // The focus a keyboard activation would already have put on the control;
    // jsdom's synthetic click does not move it.
    grip.focus();
    fireEvent.click(grip);

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(document.activeElement).toBe(grip);
  });
  /**
   * **A drag ends the gesture; it does not also ask for the list.**
   *
   * `click` fires after `pointerup`, so whatever the pointer sequence recorded
   * has to survive the release to be spent by the `click` behind it. It did
   * not: the release shared its handler with `pointercancel`, whose whole
   * reason for clearing the flag is that no `click` is coming. So every
   * completed drag redocked the bar and then opened the twelve-slot menu over
   * the slot it had just landed in.
   */
  it('does not open the slot list when the press was a drag', async () => {
    await renderDock(<Default />);
    const grip = within(dock()).getByRole('button', { name: /^Move Command Dock\./ });

    fireEvent.pointerDown(grip, { ...PRIMARY, clientX: 100, clientY: 100 });
    // Past `DRAG_THRESHOLD` on both axes, which is what makes this a drag
    // rather than a press that wobbled.
    fireEvent.pointerMove(grip, { ...PRIMARY, clientX: 220, clientY: 140 });
    fireEvent.pointerUp(grip, { ...PRIMARY, clientX: 220, clientY: 140 });
    fireEvent.click(grip);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  /**
   * The other half of the same flag. Base UI dismisses the popup on the outside
   * press, so the `click` behind that press must not ask for it again — a grip
   * that reopens what it just closed is a control with no off.
   */
  it('does not reopen the slot list when the press dismissed it', async () => {
    await renderDock(<Default />);
    const grip = within(dock()).getByRole('button', { name: /^Move Command Dock\./ });
    fireEvent.click(grip);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // The press that dismisses, and the `click` it carries. No movement, so
    // this is a press rather than a drag.
    fireEvent.pointerDown(grip, { ...PRIMARY, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(grip, { ...PRIMARY, clientX: 100, clientY: 100 });
    fireEvent.click(grip);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  /**
   * **A secondary button asks for a context menu, not for the bar to move.**
   *
   * There is no `Menu.Trigger` here, so every semantic a trigger would have
   * arrived with is this control's to state, and which button it answers is one
   * of them: `pointerdown` fires for all of them, so the right button took hold
   * of the dock and its release docked the whole command surface wherever the
   * pointer had wandered.
   */
  it('refuses a press from a secondary button', async () => {
    await renderDock(<Default />);
    const grip = within(dock()).getByRole('button', { name: /^Move Command Dock\./ });

    fireEvent.pointerDown(grip, { ...PRIMARY, button: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(grip, { ...PRIMARY, button: 2, clientX: 220, clientY: 140 });

    expect(frame()).toHaveAttribute('data-dragging', 'false');
  });

  /**
   * **One pointer owns the gesture it began.**
   *
   * A drag held by a captured pointer still sees every other pointer's moves —
   * a second finger, a pen beside a touch — and each of them was read as the
   * held gesture's own, so the dock jumped to whichever pointer moved last and
   * a stray release docked it there. The initiating pointer is retained and
   * every other one is ignored for the life of the press.
   */
  it('ignores a second pointer while a gesture is in flight', async () => {
    await renderDock(<Default />);
    const grip = within(dock()).getByRole('button', { name: /^Move Command Dock\./ });

    fireEvent.pointerDown(grip, { ...PRIMARY, clientX: 100, clientY: 100 });
    // Past the threshold, and from a pointer that never took hold of anything.
    fireEvent.pointerMove(grip, {
      pointerId: 2,
      button: 0,
      isPrimary: false,
      clientX: 220,
      clientY: 140,
    });

    expect(frame()).toHaveAttribute('data-dragging', 'false');
  });
});

/**
 * **A standing failure announces itself rather than waiting to be opened.**
 *
 * ADR 0082 binds the Dock to name which open Space is unwell, and adds the
 * clause that decides where: "a report you have to go and find is not a
 * report". The row inside the Open Spaces menu says *which* — that stays, and
 * it is the whole of the detail — but a mark only reachable by disclosing the
 * menu tells a reader who has no reason to open it nothing at all. The Sidebar
 * badged the strip permanently; this is that obligation on the surface that
 * replaced it.
 */
describe('an unwell Space the reader is not in', () => {
  it('marks the Spaces trigger before anything is disclosed', async () => {
    await renderDock(<SaveFailedElsewhere />);

    expect(screen.queryByRole('menu')).toBeNull();
    const trigger = within(dock()).getByRole('button', { name: /^Spaces\./ });
    expect(trigger).toHaveAccessibleName(/needs attention/i);
    expect(trigger.querySelector('[data-unwell]')).not.toBeNull();
  });

  /** Nothing to say while every open Space is fine, which is most of the time. */
  it('leaves the trigger unmarked while every open Space is well', async () => {
    await renderDock(<Default />);

    const trigger = within(dock()).getByRole('button', { name: /^Spaces\./ });
    expect(trigger).not.toHaveAccessibleName(/needs attention/i);
    expect(trigger.querySelector('[data-unwell]')).toBeNull();
  });

  /**
   * **The shape where the report had nowhere to go**, and the one the stories
   * cannot stage: the catalogue's session is five Spaces deep so the Open Spaces
   * menu is drawn whatever the persistence says.
   *
   * Two Spaces open and the reader in the child. The bar names the parent, so
   * the width rule had the Open Spaces menu withheld as redundant — and the
   * parent step draws a name and never a state, so a parent whose commit had
   * failed showed nothing on the bar and had no chevron to be found behind
   * either. `trailControls` now yields to the report while one stands
   * (`dock-trail.test.ts` holds the rule; this holds the surface to it).
   *
   * Assembled here rather than added to the stable sheet: it is the same
   * production `CommandDock` over the same fixture, with the one thing the
   * session shape decides — the open set and the parent — replaced. A story
   * export owes a parity claim and two suites (ADR 0052), and what is under
   * test is a derivation, not a treatment.
   */
  it('discloses the set when the only other open Space is the unwell one', async () => {
    await renderDock(<TwoSpacesWithAnUnwellParent />);

    const trigger = within(dock()).getByRole('button', { name: /^Spaces\./ });
    expect(trigger).toHaveAccessibleName(/needs attention/i);
    expect(trigger.querySelector('[data-unwell]')).not.toBeNull();

    // And the disclosure it restores still names *which* Space, which is the
    // other half of what ADR 0082 binds.
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitemradio', { name: /Design system/ })).toHaveTextContent(
      /could not be saved|not saved|failed/i,
    );
  });
});

/** Two real open Spaces; the parent's backend rejects its completed Edit. */
function TwoSpacesWithAnUnwellParent() {
  return (
    <Application
      resolve={async () => {
        const control = new MemorySpaceBackendTestControl();
        const parent = {
          ...metaSnapshot,
          document: { ...metaSnapshot.document, title: 'Design system' },
        };
        const spaces = storySpaces(
          parent.id,
          [
            parent,
            commandDockSnapshot,
            platformSnapshot,
            designSystemSnapshot,
            traversalSnapshot,
            authoredSnapshot,
            deepDiveSnapshot,
          ],
          control,
        );
        const openedParent = await spaces.open(parent.id);
        control.queueResult({ kind: 'retryable-failure', code: 'network', message: 'Unavailable' });
        const card = parent.cards[0];
        if (card === undefined) throw new Error('The parent needs a Card');
        openedParent.app.authoring.complete({
          kind: 'edited-card',
          cardId: card.id,
          document: { ...card.document, title: 'An edited Card' },
        });
        await waitFor(() =>
          expect(openedParent.session.getState().persistence.kind).toBe('failed'),
        );
        return storyOpening(spaces, await spaces.enter(commandDockSnapshot.id));
      }}
    />
  );
}

/**
 * **The last Diagram and the last Graph cannot be deleted, and the rule is not this file's.**
 *
 * The prototype's version of this test had to argue that the fixture's
 * `deleteDisabled`/`editsDisabled` flags were not the floor — that each row read
 * `<flag> || <collection>.length <= 1`, so a story passing `false` was saying
 * *no additional reason to withhold* rather than *no floor*. There is no fixture
 * flag to mistake now: the catalogue mounts production Authoring and the rule is
 * wherever Authoring keeps it.
 *
 * Still written as a test rather than as a comment, because the next reader will
 * have the same doubt and a comment would only assert the answer.
 */
describe('the last Diagram and Graph', () => {
  /** Whichever the cluster is showing now, which each deletion changes. */
  const showing = (kind: 'Diagram' | 'Active Graph'): string => {
    const name = within(dock())
      .getByRole('button', { name: new RegExp(`^${kind}: `) })
      .getAttribute('aria-label');
    if (name === null) throw new Error(`The ${kind} cluster has no accessible name`);
    return name.slice(`${kind}: `.length);
  };

  const deleteItem = (kind: 'Diagram' | 'Active Graph'): HTMLElement => {
    if (screen.queryByRole('menu') !== null) fireEvent.keyDown(document.body, { key: 'Escape' });
    const title = showing(kind);
    fireEvent.click(within(dock()).getByRole('button', { name: `${kind}: ${title}` }));
    return screen.getByRole('menuitem', { name: `Delete ${title}` });
  };

  it('withhold Delete from a story, which cannot empty the Space', async () => {
    await renderDock(<Default />);

    for (const kind of ['Diagram', 'Active Graph'] as const) {
      // Down to one, however many the fixture starts with. The loop is bounded
      // by the collection rather than by a count this test would have to keep
      // in step with the fixture.
      for (let guard = 0; guard < 10; guard += 1) {
        const item = deleteItem(kind);
        if (unavailable(item)) break;
        fireEvent.click(item);
      }
      expect(unavailable(deleteItem(kind))).toBe(true);
    }

    fireEvent.keyDown(document.body, { key: 'Escape' });
    // Still drawing: neither `loadSpaceSnapshot`'s refusal nor the fixture's own
    // guard was reached, which is what an emptied Space would have done.
    expect(within(dock()).getByRole('button', { name: /^Diagram: / })).toBeInTheDocument();
    expect(within(dock()).getByRole('button', { name: /^Active Graph: / })).toBeInTheDocument();
  });
});
