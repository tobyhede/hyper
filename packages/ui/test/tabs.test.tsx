import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../src/index';

/**
 * A panel that counts up, so a test can tell "still mounted" from "mounted
 * again": a remount resets the count, a panel that only hid keeps it.
 */
function Counter({ label }: { readonly label: string }) {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((n) => n + 1)}>
      {label} {count}
    </button>
  );
}

function Fixture({ keepMounted }: { readonly keepMounted: boolean }) {
  return (
    <Tabs orientation="vertical" defaultValue="one">
      <TabsList aria-label="Spaces">
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
        <TabsTrigger value="three">Three</TabsTrigger>
      </TabsList>
      <TabsContent value="one" keepMounted={keepMounted}>
        <Counter label="one" />
      </TabsContent>
      <TabsContent value="two" keepMounted={keepMounted}>
        <Counter label="two" />
      </TabsContent>
      <TabsContent value="three" keepMounted={keepMounted}>
        <Counter label="three" />
      </TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('pairs each tab with the panel it governs', () => {
    render(<Fixture keepMounted />);

    const one = screen.getByRole('tab', { name: 'One' });
    expect(one).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', one.getAttribute('aria-controls'));
  });

  it('exposes a vertical list as one tab stop', () => {
    render(<Fixture keepMounted />);

    expect(screen.getByRole('tablist', { name: 'Spaces' })).toHaveAttribute(
      'aria-orientation',
      'vertical',
    );
    expect(screen.getAllByRole('tab').filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });

  /**
   * The roving tabindex the hand-rolled rail never had. Vertical orientation is
   * what puts it on the down arrow rather than the right.
   */
  it('moves between tabs on the arrow keys without selecting', async () => {
    render(<Fixture keepMounted />);

    const one = screen.getByRole('tab', { name: 'One' });
    const two = screen.getByRole('tab', { name: 'Two' });
    const three = screen.getByRole('tab', { name: 'Three' });
    one.focus();

    fireEvent.keyDown(one, { key: 'ArrowDown' });
    // The composite moves focus in a microtask, after its own focus management
    // has settled — so the assertion waits one turn rather than reading the
    // frame the key was pressed in.
    await Promise.resolve();
    expect(two).toHaveFocus();
    // `activateOnFocus` is off by default: arrowing highlights, it does not
    // select. That is the right default for a rail whose panels are surfaces.
    expect(one).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(two, { key: 'End' });
    await Promise.resolve();
    expect(three).toHaveFocus();
  });

  /**
   * The claim the stacked-Space rail rests on: a hidden panel keeps its own
   * state, so a surface with live state of its own — a `SpaceSidebar` and its
   * Navigation — survives being looked away from without the rail owning it.
   */
  it('keeps a hidden panel mounted and stateful when asked to', () => {
    render(<Fixture keepMounted />);

    fireEvent.click(screen.getByRole('button', { name: 'one 0' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }));
    fireEvent.click(screen.getByRole('tab', { name: 'One' }));

    expect(screen.getByRole('button', { name: 'one 1' })).toBeInTheDocument();
  });

  it('unmounts a hidden panel by default', () => {
    render(<Fixture keepMounted={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'one 0' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }));
    fireEvent.click(screen.getByRole('tab', { name: 'One' }));

    expect(screen.getByRole('button', { name: 'one 0' })).toBeInTheDocument();
  });
});
