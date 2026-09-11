import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { uuidSchema } from '@project/core';
import { ThingSearchCombobox, type ThingChoice } from '../src/index';

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

/** Real `ThingId`s, because that is what a choice's id now is. */
const THING_A = uuidSchema.parse('00000000-0000-4000-8000-00000000000a');
const THING_B = uuidSchema.parse('00000000-0000-4000-8000-00000000000b');
const THING_C = uuidSchema.parse('00000000-0000-4000-8000-00000000000c');

const CHOICES: readonly ThingChoice[] = [
  { id: THING_A, title: 'Alpha', kind: 'markdown' },
  { id: THING_B, title: 'Beta', kind: 'markdown' },
  { id: THING_C, title: 'Gamma', kind: 'markdown', refusal: 'That Edge already exists.' },
];

/** A Thing whose Title runs to more than one line (ADR 0083). */
const LADDERED: readonly ThingChoice[] = [
  { id: THING_A, title: 'Auth\nHow a session begins\nOAuth only', kind: 'markdown' },
  { id: THING_B, title: 'Beta', kind: 'markdown' },
];

function open(onValueChange = vi.fn()) {
  render(
    <ThingSearchCombobox
      label="To"
      testId="edge-to"
      choices={CHOICES}
      value={THING_A}
      onValueChange={onValueChange}
    />,
  );
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'To' }), { key: 'ArrowDown' });
  return onValueChange;
}

describe('ThingSearchCombobox', () => {
  /**
   * One visible input names the field and shows what it currently holds, so an
   * Edge editor drawn over the canvas says which Thing each endpoint is without
   * opening anything.
   */
  it('names the field and shows the chosen Thing before it is opened', () => {
    render(
      <ThingSearchCombobox
        label="To"
        choices={CHOICES}
        value={THING_A}
        onValueChange={() => undefined}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'To' })).toHaveValue('Alpha');
  });

  /**
   * A refused choice keeps its place and says why *in the row*. Filtering it out
   * would leave an author searching for a Thing the list simply does not show;
   * a tooltip needs a hover a keyboard author never makes.
   */
  it('keeps a refused choice in the list, disabled, with its reason on the row', () => {
    open();

    const refused = screen.getByRole('option', { name: /Gamma/ });
    expect(refused).toHaveAttribute('aria-disabled', 'true');
    expect(refused).toHaveTextContent('That Edge already exists.');
  });

  it('answers the chosen Thing', () => {
    const onValueChange = open();

    fireEvent.click(screen.getByRole('option', { name: 'Markdown Thing Beta' }));

    expect(onValueChange).toHaveBeenCalledWith(THING_B);
  });

  /**
   * The search matches the **title**, not the value behind it. Every row's id is
   * a Thing's UUID, so a filter over the value would rank a one-letter search by
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
      <ThingSearchCombobox
        label="Target"
        choices={[]}
        value={null}
        onValueChange={() => undefined}
        emptyMessage="This Space holds no other Thing that owns its content."
      />,
    );

    const field = screen.getByRole('combobox', { name: 'Target' });
    const described = (field.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(described).toHaveLength(1);
    expect(document.getElementById(described[0] ?? '')).toHaveTextContent(
      'This Space holds no other Thing that owns its content.',
    );
  });

  /**
   * The empty-list note is an addition, never a replacement. A caller's own
   * description is a refusal attached to this field — an Alias whose Target has
   * left the Space is refused *and* has no Thing left to choose, so both are true
   * at once, and dropping the caller's leaves `aria-invalid` announcing a
   * problem no assistive technology can read out.
   */
  it('keeps the caller’s description when it adds its own', () => {
    render(
      <div>
        <ThingSearchCombobox
          label="Target"
          choices={[]}
          value={null}
          onValueChange={() => undefined}
          inputAttributes={{ 'aria-invalid': true, 'aria-describedby': 'target-error' }}
          emptyMessage="This Space holds no other Thing that owns its content."
        />
        <p id="target-error">That Target is no longer part of the Space.</p>
      </div>,
    );

    const field = screen.getByRole('combobox', { name: 'Target' });
    // Announced in the order named, and the refusal is what the author acts on.
    const described = (field.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    expect(described[0]).toBe('target-error');
    expect(described.map((id) => document.getElementById(id)?.textContent)).toContain(
      'This Space holds no other Thing that owns its content.',
    );
  });

  /** With Things to offer, the field carries only what the caller asked for. */
  it('describes the field with the caller’s ids alone while it has choices', () => {
    render(
      <ThingSearchCombobox
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

  /**
   * The one surface where a Thing's name and its Title come apart (ADR 0083).
   * An author's recall does not respect which line they typed a word on, so a
   * word from a subtitle finds the Thing — while the row and the field still say
   * the name, because a newline in a row draws as a broken-looking label.
   */
  describe('a Title written on more than one line', () => {
    it('shows the Thing’s name in the field and in the row', () => {
      render(
        <ThingSearchCombobox
          label="Target"
          choices={LADDERED}
          value={THING_A}
          onValueChange={() => undefined}
        />,
      );

      const field = screen.getByRole('combobox', { name: 'Target' });
      expect(field).toHaveValue('Auth');

      fireEvent.keyDown(field, { key: 'ArrowDown' });
      expect(screen.getByRole('option', { name: 'Markdown Thing Auth' })).toBeInTheDocument();
    });

    it('finds the Thing by a word from a line below the name', () => {
      render(
        <ThingSearchCombobox
          label="Target"
          choices={LADDERED}
          value={null}
          onValueChange={() => undefined}
        />,
      );

      const field = screen.getByRole('combobox', { name: 'Target' });
      fireEvent.keyDown(field, { key: 'ArrowDown' });
      fireEvent.change(field, { target: { value: 'session' } });

      expect(screen.getByRole('option', { name: 'Markdown Thing Auth' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Beta/ })).not.toBeInTheDocument();
    });
  });
});
