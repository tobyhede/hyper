import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EntityActions, EntityActionsTrigger, type EntityAction } from '../src/EntityActionsMenu';

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

afterAll(() => vi.unstubAllGlobals());

/** One command that reports both ways, over whichever outcome a test hands it. */
const copyCommand = (onSelect: EntityAction['onSelect']): EntityAction => ({
  id: 'copy-link',
  label: 'Copy link',
  report: { done: 'Copied', failed: 'Not copied' },
  onSelect,
});

const openMenuAnd = async (action: EntityAction) => {
  render(<EntityActionsTrigger label="Actions" groups={[[action]]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: /Copy link/ }));
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
