import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { CardSearchCombobox, type CardChoice } from '../src/index';

/**
 * The one production picker, tested at the component rather than through the
 * surfaces that compose it — Edge `From`/`To`, new Alias Target and opened
 * Alias Target. Every behaviour here is the picker's own contract with all of
 * them, so a regression belongs to this file rather than to
 * whichever surface happened to notice.
 *
 * Base UI's popup positions itself by measuring, and jsdom ships no
 * `ResizeObserver` — it is reached before the list can open at all.
 */
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

/** Real `CardId`s, because that is what a choice's id now is. */
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');
const CARD_C = uuidSchema.parse('00000000-0000-4000-8000-00000000000c');

const CHOICES: readonly CardChoice[] = [
  { id: CARD_A, title: 'Alpha', kind: 'markdown' },
  { id: CARD_B, title: 'Beta', kind: 'markdown' },
  { id: CARD_C, title: 'Gamma', kind: 'markdown', refusal: 'That Edge already exists.' },
];

function open(onValueChange = vi.fn()) {
  render(
    <CardSearchCombobox
      label="To"
      testId="edge-to"
      choices={CHOICES}
      value={CARD_A}
      onValueChange={onValueChange}
    />,
  );
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'To' }), { key: 'ArrowDown' });
  return onValueChange;
}

describe('CardSearchCombobox', () => {
  /**
   * One visible input names the field and shows what it currently holds, so an
   * Edge editor drawn over the canvas says which Card each endpoint is without
   * opening anything.
   */
  it('names the field and shows the chosen Card before it is opened', () => {
    render(
      <CardSearchCombobox
        label="To"
        choices={CHOICES}
        value={CARD_A}
        onValueChange={() => undefined}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('Alpha');
  });

  /**
   * A refused choice keeps its place and says why *in the row*. Filtering it out
   * would leave an author searching for a Card the list simply does not show;
   * a tooltip needs a hover a keyboard author never makes.
   */
  it('keeps a refused choice in the list, disabled, with its reason on the row', () => {
    open();

    const refused = screen.getByRole('option', { name: /Gamma/ });
    expect(refused).toHaveAttribute('aria-disabled', 'true');
    expect(refused).toHaveTextContent('That Edge already exists.');
  });

  it('answers the chosen Card', () => {
    const onValueChange = open();

    fireEvent.click(screen.getByRole('option', { name: 'Markdown Card Beta' }));

    expect(onValueChange).toHaveBeenCalledWith(CARD_B);
  });

  /**
   * The search matches the **title**, not the value behind it. Every row's id is
   * a Card's UUID, so a filter over the value would rank a one-letter search by
   * hex noise.
   */
  it('searches titles rather than the ids behind them', () => {
    open();

    fireEvent.change(screen.getByRole('combobox', { name: 'To' }), { target: { value: 'gam' } });

    expect(screen.getByRole('option', { name: /Gamma/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Alpha/ })).not.toBeInTheDocument();
  });

  /**
   * With nothing to offer, the field says so to a screen reader as well as to
   * the open list — the list has to be opened to be read, and the reason the
   * author cannot proceed should not need a gesture to hear.
   */
  it('describes an empty list on the field itself', () => {
    render(
      <CardSearchCombobox
        label="Target"
        choices={[]}
        value={null}
        onValueChange={() => undefined}
        emptyMessage="This Space holds no other Card that owns its content."
      />,
    );

    const field = screen.getByRole('combobox', { name: 'Target' });
    const described = (field.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(described).toHaveLength(1);
    expect(document.getElementById(described[0] ?? '')).toHaveTextContent(
      'This Space holds no other Card that owns its content.',
    );
  });

  /**
   * The empty-list note is an addition, never a replacement. A caller's own
   * description is a refusal attached to this field — an Alias whose Target has
   * left the Space is refused *and* has no Card left to choose, so both are true
   * at once, and dropping the caller's leaves `aria-invalid` announcing a
   * problem no assistive technology can read out.
   */
  it('keeps the caller’s description when it adds its own', () => {
    render(
      <div>
        <CardSearchCombobox
          label="Target"
          choices={[]}
          value={null}
          onValueChange={() => undefined}
          inputAttributes={{ 'aria-invalid': true, 'aria-describedby': 'target-error' }}
          emptyMessage="This Space holds no other Card that owns its content."
        />
        <p id="target-error">That Target is no longer part of the Space.</p>
      </div>,
    );

    const field = screen.getByRole('combobox', { name: 'Target' });
    // Announced in the order named, and the refusal is what the author acts on.
    const described = (field.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(described[0]).toBe('target-error');
    expect(described.map((id) => document.getElementById(id)?.textContent)).toContain(
      'This Space holds no other Card that owns its content.',
    );
  });

  /** With Cards to offer, the field carries only what the caller asked for. */
  it('describes the field with the caller’s ids alone while it has choices', () => {
    render(
      <CardSearchCombobox
        label="Target"
        choices={CHOICES}
        value={null}
        onValueChange={() => undefined}
        inputAttributes={{ 'aria-describedby': 'target-error' }}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Target' })).toHaveAttribute(
      'aria-describedby',
      'target-error',
    );
  });
});
