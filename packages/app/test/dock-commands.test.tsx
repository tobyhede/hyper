import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Default, SaveFailedElsewhere } from '../stories/space/command-dock.stories';

/**
 * What the Command Dock owes an author, held over the prototype that draws it.
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

describe('placing a Card into a Layout without a pointer (ADR 0082)', () => {
  /**
   * The rows were `<div draggable>` — no role, no tab stop, no activation — so
   * an HTML5 drag was the only way to add a Card to the Layout. ADR 0082 says a
   * drag may be *a* way and never the only one.
   */
  it('offers each Card in the list as a focusable button', () => {
    render(<Default />);
    fireEvent.click(within(dock()).getByRole('button', { name: 'Cards' }));

    const row = screen.getByRole('button', { name: 'Add Constraints to Layout' });

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
   * selected Layout and the canvas draws it — which is the observable a drop
   * would have produced.
   */
  it('adds the Card to the drawing Layout, as the drop does', async () => {
    render(<Default />);
    fireEvent.click(within(dock()).getByRole('button', { name: 'Cards' }));

    // `Collection 1` places five of the fixture's Cards and `Constraints` is
    // not one of them. The canvas resolves its placement asynchronously, so the
    // count is waited for rather than read on the spot.
    const placed = (): number => document.querySelectorAll('[data-testid^="rf__node-"]').length;
    await waitFor(() => expect(placed()).toBe(5));

    fireEvent.click(screen.getByRole('button', { name: 'Add Constraints to Layout' }));

    await waitFor(() => expect(placed()).toBe(6));
    // The list is not dismissed by the placement: adding several Cards costs
    // one disclosure, exactly as the drag out of it does.
    expect(screen.getByRole('button', { name: 'Add Prior art to Layout' })).toBeInTheDocument();
  });
});

describe("every control's accessible name contains its visible label (WCAG 2.5.3)", () => {
  /**
   * The Open Spaces menu is the control this rule was written down for: it showed
   * `Spaces` under `aria-label="Switch Space. N open."`, so speech input could
   * not reach the word on its face. It is one token now, spent in both places.
   */
  it('names the root Open Spaces menu with the word it shows', () => {
    render(<Default />);
    // Three crossings in, the Open Spaces menu is a bare chevron; the word is what the
    // root draws. Walk up to it, which is what the parent step is for.
    fireEvent.click(within(dock()).getByRole('button', { name: 'Go to Design system' }));
    fireEvent.click(within(dock()).getByRole('button', { name: 'Go to Platform' }));
    fireEvent.click(within(dock()).getByRole('button', { name: 'Go to Meta Space' }));

    const openSpacesMenu = within(dock()).getByRole('button', { name: /^Spaces\./ });

    expect(visibleLabel(openSpacesMenu)).toBe('Spaces');
    expect(accessibleName(openSpacesMenu)).toContain(visibleLabel(openSpacesMenu));
  });

  /**
   * And the rule over the whole bar rather than the one control that broke it.
   * A control with no words on it owes nothing here; every one that carries
   * them owes its name.
   */
  it('holds every named control in the bar to it', () => {
    render(<Default />);

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
  it('draws one root and four named groups inside it', () => {
    render(<Default />);

    const groups = within(dock()).getAllByRole('group');

    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'Space',
      'Layout',
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
  it('keeps the way back inside the same roving order', () => {
    render(<Default />);

    const parent = within(dock()).getByRole('button', { name: 'Go to Design system' });

    expect(parent.closest('[role="toolbar"]')).toBe(dock());
  });
});

describe('the grip discloses the twelve slots (ADR 0082)', () => {
  /**
   * The grip is no longer a `Menu.Trigger`: Base UI opens one on `mousedown`,
   * which is the first pixel of the drag, and the deferral that stood here was
   * built on a guard that does not exist. It is a plain toolbar button with one
   * `onClick`, and the menu positions against it through `anchor`.
   */
  it('opens the slot menu from one activation', () => {
    render(<Default />);
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
  it('redocks the surface to a chosen slot', () => {
    render(<Default />);
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
  it('returns focus to the grip when the list is dismissed', () => {
    render(<Default />);
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
  it('does not open the slot list when the press was a drag', () => {
    render(<Default />);
    const grip = within(dock()).getByRole('button', { name: /^Move Command Dock\./ });

    fireEvent.pointerDown(grip, { pointerId: 1, clientX: 100, clientY: 100 });
    // Past `DRAG_THRESHOLD` on both axes, which is what makes this a drag
    // rather than a press that wobbled.
    fireEvent.pointerMove(grip, { pointerId: 1, clientX: 220, clientY: 140 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: 220, clientY: 140 });
    fireEvent.click(grip);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  /**
   * The other half of the same flag. Base UI dismisses the popup on the outside
   * press, so the `click` behind that press must not ask for it again — a grip
   * that reopens what it just closed is a control with no off.
   */
  it('does not reopen the slot list when the press dismissed it', () => {
    render(<Default />);
    const grip = within(dock()).getByRole('button', { name: /^Move Command Dock\./ });
    fireEvent.click(grip);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // The press that dismisses, and the `click` it carries. No movement, so
    // this is a press rather than a drag.
    fireEvent.pointerDown(grip, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.click(grip);

    expect(screen.queryByRole('menu')).toBeNull();
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
  it('marks the Spaces trigger before anything is disclosed', () => {
    render(<SaveFailedElsewhere />);

    expect(screen.queryByRole('menu')).toBeNull();
    const trigger = within(dock()).getByRole('button', { name: /^Spaces\./ });
    expect(trigger).toHaveAccessibleName(/needs attention/i);
    expect(trigger.querySelector('[data-unwell]')).not.toBeNull();
  });

  /** Nothing to say while every open Space is fine, which is most of the time. */
  it('leaves the trigger unmarked while every open Space is well', () => {
    render(<Default />);

    const trigger = within(dock()).getByRole('button', { name: /^Spaces\./ });
    expect(trigger).not.toHaveAccessibleName(/needs attention/i);
    expect(trigger.querySelector('[data-unwell]')).toBeNull();
  });
});
