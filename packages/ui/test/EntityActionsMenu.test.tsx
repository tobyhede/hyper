import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  EntityActions,
  EntityActionsTrigger,
  type EntityAction,
  type EntityActionOutcome,
} from '../src/EntityActionsMenu';

/** The three jsdom leaves off `HTMLElement`, named so both halves agree. */
type PointerCaptureMethod = 'hasPointerCapture' | 'setPointerCapture' | 'releasePointerCapture';

const pointerCaptureDescriptor = (name: PointerCaptureMethod) =>
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);

/**
 * Captured before the stubs go on, because a write to a shared prototype
 * outlives the file that made it.
 *
 * `vi.unstubAllGlobals` undoes `vi.stubGlobal` and knows nothing at all about a
 * direct prototype assignment, so the three below used to survive this suite —
 * harmless only because `vitest.config.ts` leaves `isolate` at its default
 * `true`, and a permanently `false` `hasPointerCapture` the moment that changes
 * or these stubs move into a shared setup file.
 *
 * jsdom defines none of the three, so restoring means taking them back off. The
 * descriptor is captured rather than that absence assumed, so this keeps
 * restoring rather than deleting the day jsdom ships them.
 */
const originalPointerCapture = {
  hasPointerCapture: pointerCaptureDescriptor('hasPointerCapture'),
  setPointerCapture: pointerCaptureDescriptor('setPointerCapture'),
  releasePointerCapture: pointerCaptureDescriptor('releasePointerCapture'),
};

const restorePointerCapture = (name: PointerCaptureMethod, original?: PropertyDescriptor) => {
  if (original === undefined) Reflect.deleteProperty(HTMLElement.prototype, name);
  else Object.defineProperty(HTMLElement.prototype, name, original);
};

/**
 * Base UI's menu positions itself through Floating UI, which measures. jsdom
 * ships neither `ResizeObserver` nor pointer capture, and both are reached
 * before the menu can open at all — the same stub `dropdown-menu.test.tsx`
 * installs, for the same reason.
 */
beforeAll(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
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

afterAll(() => {
  vi.unstubAllGlobals();
  restorePointerCapture('hasPointerCapture', originalPointerCapture.hasPointerCapture);
  restorePointerCapture('setPointerCapture', originalPointerCapture.setPointerCapture);
  restorePointerCapture('releasePointerCapture', originalPointerCapture.releasePointerCapture);
});

/** One command that reports both ways, over whichever outcome a test hands it. */
const copyCommand = (onSelect: EntityAction['onSelect']): EntityAction => ({
  id: 'copy-link',
  label: 'Copy link',
  report: { done: 'Copied', failed: 'Not copied' },
  onSelect,
});

/**
 * A second reporting command, so a test can have two in flight at once.
 *
 * Its words are distinct from `copyCommand`'s on purpose: which row a
 * confirmation lands on is the whole subject of the ordering test, and two
 * commands both reporting "Copied" would leave that unreadable.
 */
const permanentCopyCommand = (onSelect: EntityAction['onSelect']): EntityAction => ({
  id: 'copy-permanent-link',
  label: 'Copy permanent link',
  report: { done: 'Permanent link copied', failed: 'Permanent link not copied' },
  onSelect,
});

/** A command the Sidebar's Delete Layout is shaped like: it reports no words. */
const deleteLayoutCommand = (onSelect: EntityAction['onSelect']): EntityAction => ({
  id: 'delete-layout',
  label: 'Delete Layout',
  variant: 'destructive',
  onSelect,
});

/** A promise a test settles by hand, so a command can be left in flight. */
const deferredOutcome = () => {
  let settle: (outcome: EntityActionOutcome) => void = () => undefined;
  const promise = new Promise<EntityActionOutcome>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
};

/**
 * Enough microtask turns for the hook's own promise chain to run out.
 *
 * Deliberately not `waitFor`, which polls on a timer — the unmount test's whole
 * assertion is about what does and does not reach `window.setTimeout`, and a
 * helper that arms one of its own would answer its own question.
 */
const settled = () =>
  Promise.resolve()
    .then(() => undefined)
    .then(() => undefined)
    .then(() => undefined)
    .then(() => undefined);

const openMenu = (...groups: readonly EntityAction[][]) => {
  const rendered = render(<EntityActionsTrigger label="Actions" groups={groups} />);
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  return rendered;
};

const press = async (name: RegExp) =>
  fireEvent.click(await screen.findByRole('menuitem', { name }));

const openMenuAnd = async (action: EntityAction) => {
  openMenu([action]);
  await press(new RegExp(action.label));
};

/** The polite region the label swap is announced through, wherever it lives. */
const announcement = () => document.querySelector('[aria-live]');

describe('the entity actions menu', () => {
  /**
   * A confirmation is a report about the command, not about the press.
   *
   * `onSelect` was called and the label swapped to "Copied" in the same
   * breath, so a clipboard write the browser refused still read as done — the
   * application's own copy is fire-and-forget past a `then`, so the refusal
   * arrived after the menu had already claimed success.
   */
  it('withholds the confirmation from a command that answers that it failed', async () => {
    await openMenuAnd(copyCommand(() => Promise.resolve('failed')));

    expect(await screen.findByRole('menuitem', { name: /Not copied/ })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /^Copied/ })).not.toBeInTheDocument();
  });

  /**
   * And the failure is reported *in the menu*, which is the only place a
   * reader on a phone can be shown it: below the Sidebar's breakpoint the whole
   * surface is a Sheet drawn over the canvas, and the application's standing
   * "Link not copied" alert renders in the shell area behind it.
   */
  it('announces the failure it reports', async () => {
    await openMenuAnd(copyCommand(() => Promise.resolve('failed')));

    await screen.findByRole('menuitem', { name: /Not copied/ });
    expect(announcement()).toHaveTextContent('Not copied');
  });

  it('confirms a command that answers at once', async () => {
    await openMenuAnd(copyCommand(() => 'done'));

    expect(await screen.findByRole('menuitem', { name: /Copied/ })).toBeVisible();
    expect(announcement()).toHaveTextContent('Copied');
  });

  it('confirms a command whose promise answers that it ran', async () => {
    await openMenuAnd(copyCommand(() => Promise.resolve('done')));

    expect(await screen.findByRole('menuitem', { name: /Copied/ })).toBeVisible();
  });

  /**
   * A command that throws has failed, and is reported as one.
   *
   * The call used to sit in front of the promise chain rather than inside it,
   * so a command that threw before it ever returned a promise threw out of a
   * React event handler — which no error boundary catches — and the item was
   * left sitting under its unchanged label.
   */
  it('reports the failure of a command that throws instead of answering', async () => {
    const recorded = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openMenuAnd(
      copyCommand(() => {
        throw new Error('the clipboard is unavailable');
      }),
    );

    expect(await screen.findByRole('menuitem', { name: /Not copied/ })).toBeVisible();
    expect(recorded).toHaveBeenCalled();
  });

  it('reports the failure of a command whose promise rejects', async () => {
    const recorded = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openMenuAnd(
      copyCommand(() => Promise.reject(new Error('the Space has stopped loading'))),
    );

    expect(await screen.findByRole('menuitem', { name: /Not copied/ })).toBeVisible();
    expect(recorded).toHaveBeenCalled();
  });

  /**
   * The failure of a command that names no words still has to go somewhere.
   *
   * This is the Sidebar's Delete Layout: it reports no words, wraps its command
   * in an `async` function to dismiss the mobile Sheet on the outcome, and runs
   * an Edit whose `complete` throws outright for a Space that has stopped
   * loading. The rejection used to be discarded unread — the menu had already
   * closed, the Sheet stayed open, no alert was armed, and the author pressed
   * Delete Layout to no effect and no message anywhere.
   */
  it('does not drop the failure of a command that reports no words', async () => {
    const recorded = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('the Space has stopped loading');
    openMenu([
      deleteLayoutCommand(async () => {
        await Promise.resolve();
        throw failure;
      }),
    ]);
    await press(/Delete Layout/);

    await vi.waitFor(() => expect(recorded).toHaveBeenCalledWith(expect.any(String), failure));
  });

  /**
   * The last press wins, not the last answer.
   *
   * One `report` and one timer serve the whole menu, and a reporting item keeps
   * its menu open (`closeOnClick` is false), so two commands really can be in
   * flight at once. Each settlement used to overwrite both unconditionally, so
   * a slow copy landing after a fast one moved the confirmation onto the row
   * the author had not just pressed and announced it a second time.
   */
  it('leaves the confirmation on the command that was pressed last', async () => {
    const slow = deferredOutcome();
    openMenu([copyCommand(() => slow.promise), permanentCopyCommand(() => 'done')]);
    await press(/Copy link/);
    await press(/Copy permanent link/);
    await screen.findByRole('menuitem', { name: 'Permanent link copied' });

    await act(async () => {
      slow.settle('done');
      await settled();
    });

    expect(screen.getByRole('menuitem', { name: 'Permanent link copied' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
    expect(announcement()).toHaveTextContent('Permanent link copied');
  });

  /**
   * Unmounting is the last press.
   *
   * The cleanup clears the timer that is pending when the menu goes, but a
   * command settling afterwards used to set state on a gone component and arm a
   * fresh 1600ms timeout behind the cleanup that had already run — a timer with
   * no surviving path to clear it. The Sidebar unmounting mid-clipboard-write is
   * an ordinary Space switch, or the mobile Sheet closing.
   */
  it('arms no timer for a command that answers after its menu has gone', async () => {
    const slow = deferredOutcome();
    const { unmount } = openMenu([copyCommand(() => slow.promise)]);
    await press(/Copy link/);
    unmount();

    const armed = vi.spyOn(window, 'setTimeout');
    slow.settle('done');
    await settled();

    expect(armed).not.toHaveBeenCalled();
  });

  /**
   * Why the live region may sit outside the popup, which is the one thing that
   * makes the swap audible: Base UI's own `markOthers` collects every
   * `[aria-live]` element in the document and keeps it — and its ancestors —
   * out of the set it hides, precisely so a region outside a modal popup still
   * announces. A dropdown menu is not modal in the first place (`MenuPopup`
   * passes `modal: isContextMenu`), so this is the demanding path of the two.
   *
   * Pinned because it is a third-party guarantee the placement rests on: the
   * day it stops holding, the region has to move inside the popup and the
   * comment that explains its placement has to move with it.
   */
  it('leaves its announcement in the accessibility tree under the modal context menu', async () => {
    render(
      <EntityActions groups={[[copyCommand(() => 'done')]]}>
        <button type="button">Row</button>
      </EntityActions>,
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Row' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Copy link/ }));

    await screen.findByRole('menuitem', { name: /Copied/ });
    const region = announcement();
    expect(region).toHaveTextContent('Copied');
    expect(region?.closest('[aria-hidden="true"]')).toBeNull();
    expect(region?.getAttribute('aria-hidden')).toBeNull();
  });
});
