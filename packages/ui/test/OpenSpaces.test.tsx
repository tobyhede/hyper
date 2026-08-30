import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpenSpaces } from '../src';

function Counter({ label }: { readonly label: string }) {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      {label} {count}
    </button>
  );
}

function Fixture() {
  const [activeId, setActiveId] = useState('one');
  return (
    <OpenSpaces
      activeId={activeId}
      onSelect={setActiveId}
      entries={[
        { id: 'one', title: 'One', content: <Counter label="one" /> },
        { id: 'two', title: 'Two', status: 'failed', content: <Counter label="two" /> },
        { id: 'three', title: 'Three', content: <Counter label="three" /> },
      ]}
    />
  );
}

describe('OpenSpaces', () => {
  it('shows the first Space when the requested active Space is no longer open', () => {
    render(
      <OpenSpaces
        activeId="closed"
        onSelect={() => undefined}
        entries={[
          { id: 'one', title: 'One', content: <p>First panel</p> },
          { id: 'two', title: 'Two', content: <p>Second panel</p> },
        ]}
      />,
    );

    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('First panel')).toBeVisible();
  });

  it('draws nothing beside a single Space', () => {
    render(
      <OpenSpaces
        activeId="one"
        onSelect={() => undefined}
        entries={[{ id: 'one', title: 'One', content: <p>Only panel</p> }]}
      />,
    );

    expect(screen.queryByRole('tablist', { name: 'Open Spaces' })).not.toBeInTheDocument();
    expect(screen.getByText('Only panel')).toBeInTheDocument();
  });

  it('uses one vertical tab stop and moves focus without selecting', async () => {
    render(<Fixture />);
    const one = screen.getByRole('tab', { name: 'One' });
    const two = screen.getByRole('tab', { name: /Two/ });

    expect(screen.getByRole('tablist', { name: 'Open Spaces' })).toHaveAttribute(
      'aria-orientation',
      'vertical',
    );
    expect(screen.getAllByRole('tab').filter((entry) => entry.tabIndex === 0)).toHaveLength(1);

    await act(async () => {
      one.focus();
      fireEvent.keyDown(one, { key: 'ArrowDown' });
      await Promise.resolve();
    });
    expect(two).toHaveFocus();
    expect(one).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps a hidden Space panel mounted and stateful', () => {
    render(<Fixture />);

    fireEvent.click(screen.getByRole('button', { name: 'one 0' }));
    fireEvent.click(screen.getByRole('tab', { name: /Two/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'One' }));

    expect(screen.getByRole('button', { name: 'one 1' })).toBeInTheDocument();
  });

  /**
   * A `tablist` announces how many tabs it owns, and only its `tab` children
   * count. A presentational wrapper between the two leaves the set size
   * unresolvable, so a screen reader cannot say "tab 1 of 3".
   */
  it('owns its entries directly, so the tablist can announce its size', () => {
    render(<Fixture />);
    const list = screen.getByRole('tablist', { name: 'Open Spaces' });

    expect(within(list).getAllByRole('tab')).toHaveLength(3);
    for (const child of list.children) {
      expect(child).toHaveAttribute('role', 'tab');
    }
  });

  /**
   * Closing a Space must not disturb the ones that stay open. The single-entry
   * case draws no entry strip, and if it reaches that by rendering a different
   * tree the surviving panel remounts — losing exactly the live command state
   * this component exists to keep.
   */
  it('keeps the surviving Space mounted when the last other Space closes', () => {
    function Closing() {
      const [open, setOpen] = useState(['one', 'two']);
      return (
        <>
          <button type="button" onClick={() => setOpen(['one'])}>
            Close two
          </button>
          <OpenSpaces
            activeId="one"
            onSelect={() => undefined}
            entries={open.map((id) => ({ id, title: id, content: <Counter label={id} /> }))}
          />
        </>
      );
    }
    render(<Closing />);

    fireEvent.click(screen.getByRole('button', { name: 'one 0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close two' }));

    expect(screen.queryByRole('tablist', { name: 'Open Spaces' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'one 1' })).toBeInTheDocument();
  });

  it('names a stopped-saving status on its entry', () => {
    render(<Fixture />);
    expect(screen.getByRole('tab', { name: /Two Save failed/ })).toBeInTheDocument();
  });
});
