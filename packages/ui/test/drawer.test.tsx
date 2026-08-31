import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerPopup,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
  DrawerViewport,
} from '../src';

/**
 * The composition every consumer writes: a named trigger, a titled popup, and an
 * ordinary button outside the drawer standing in for the surface behind it.
 */
function Fixture({
  disablePointerDismissal = false,
}: {
  readonly disablePointerDismissal?: boolean;
}) {
  return (
    <>
      <button type="button" onClick={() => undefined}>
        Behind the drawer
      </button>
      <Drawer modal={false} disablePointerDismissal={disablePointerDismissal}>
        <DrawerTrigger>Cards</DrawerTrigger>
        <DrawerPortal>
          <DrawerViewport>
            <DrawerPopup>
              <DrawerContent>
                <DrawerTitle>Cards</DrawerTitle>
                <DrawerClose>Close</DrawerClose>
              </DrawerContent>
            </DrawerPopup>
          </DrawerViewport>
        </DrawerPortal>
      </Drawer>
    </>
  );
}

const openDrawer = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
  return await screen.findByRole('dialog', { name: 'Cards' });
};

describe('Drawer', () => {
  it('opens from its trigger as a dialog named by its title', async () => {
    render(<Fixture />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await openDrawer()).toBeVisible();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<Fixture />);
    const trigger = screen.getByRole('button', { name: 'Cards' });
    const popup = await openDrawer();

    fireEvent.keyDown(popup, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes from its own close control', async () => {
    render(<Fixture />);
    await openDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('stays open across a press outside it when pointer dismissal is disabled', async () => {
    render(<Fixture disablePointerDismissal />);
    await openDrawer();

    const outside = screen.getByRole('button', { name: 'Behind the drawer' });
    act(() => {
      fireEvent.pointerDown(outside);
      fireEvent.mouseDown(outside);
      fireEvent.click(outside);
      outside.focus();
    });

    expect(screen.getByRole('dialog', { name: 'Cards' })).toBeVisible();
  });

  it('closes on a press outside it by default', async () => {
    render(<Fixture />);
    await openDrawer();

    const outside = screen.getByRole('button', { name: 'Behind the drawer' });
    act(() => {
      fireEvent.pointerDown(outside);
      fireEvent.mouseDown(outside);
      fireEvent.click(outside);
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
