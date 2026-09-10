import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../src/components/dropdown-menu';

/**
 * Base UI's menu positions itself through Floating UI, which measures. jsdom
 * ships neither `ResizeObserver` nor pointer capture, and both are reached
 * before the menu can open at all.
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

describe('DropdownMenu', () => {
  /**
   * React Flow's live Space-key pan activation subscription reaches a
   * portalled popup, so the popup must carry its own exclusion marker
   * (docs/agents/ui.md).
   */
  it('excludes its portalled popup from Space-key canvas panning', () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByRole('menu').closest('.nokey')).not.toBeNull();
  });

  /**
   * A destructive item is ink at rest, red where the reader is, and its glyph
   * follows the row.
   *
   * Two registry defaults are gone and this is what holds them gone. The drop
   * painted `color` on the child `svg`, which a surface restating the row's
   * colour could not reach past — a declared colour is not overridden by an
   * ancestor's, however specific — so a consumer that wanted Delete to be ink
   * had to restate the glyph too and reach for `!important`. And the drop
   * painted the row itself `text-destructive` at rest, so a menu with a Delete
   * in it read as a warning about the menu rather than about the one command
   * that removes something.
   *
   * Both were consumer overrides in the Command Dock's stylesheet until they
   * were settled here (`.scratch/command-dock/issues/03`, `/07`). The test is
   * what stops the second one coming back with the next registry sync: `focus:`
   * may name `text-destructive`, and the resting class list may not.
   */
  it('paints a destructive item only where the reader is, and lets its glyph follow', () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const item = screen.getByRole('menuitem', { name: 'Delete' });
    expect(item).toHaveAttribute('data-variant', 'destructive');
    expect(item.className).toContain('data-[variant=destructive]:focus:text-destructive');
    expect(item.className).not.toContain('data-[variant=destructive]:text-destructive');
    expect(item.className).not.toContain('data-[variant=destructive]:*:[svg]:text-destructive');
  });

  /**
   * The radio group is generic over its value, so a caller gets back the type
   * it put in. Base UI declares all three of `value`, `defaultValue` and
   * `onValueChange` as `any`; absorbing that here is what stops each consumer
   * laundering the value it is handed.
   */
  it('hands a chosen value back at the type the group was given', () => {
    const chosen: string[] = [];

    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup
            value="first"
            onValueChange={(next) => {
              expectTypeOf(next).toEqualTypeOf<string>();
              chosen.push(next);
            }}
          >
            <DropdownMenuRadioItem value="first">First</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="second">Second</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Second' }));

    expect(chosen).toEqual(['second']);
  });

  /**
   * The items are held to the same type as the group that reads them.
   *
   * The group's generic was a promise nothing kept: `RadioItem`'s own `value`
   * stayed Base UI's `any`, so a mistyped item still rendered and its value
   * still came back out typed as the group's `Value`. An item binds the type
   * once — `DropdownMenuRadioItem<Value>`, or an instantiation expression
   * where a surface writes several — and a value the group could not produce
   * is then a compile error at the item that would produce it.
   */
  it('refuses an item value the group it belongs to could not produce', () => {
    const Side = DropdownMenuRadioItem<'left' | 'right'>;

    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup<'left' | 'right'> defaultValue="left">
            <Side value="left">Left</Side>
            {/* @ts-expect-error The group deals in 'left' | 'right', and 'middle' is neither. */}
            <Side value="middle">Middle</Side>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByRole('menuitemradio', { name: 'Left' })).toBeInTheDocument();
  });

  /**
   * The composition rule's other half, held where it can be seen: an item left
   * unbound is held to nothing, and the value it returns wears the group's type
   * anyway.
   *
   * This is the failure the bound form above prevents, written out rather than
   * described — `'middle'` is not one of the two things this group deals in, it
   * renders, it is chosen, and `next` arrives typed `'left' | 'right'` while
   * holding `'middle'`. A consumer that trusted the declaration and dropped its
   * runtime lookup is then reading a value off a list that cannot contain it.
   *
   * **It compiles on purpose and must not be relaxed into an endorsement.** The
   * group cannot detect the omission (`packages/ui/src/components/dropdown-menu.tsx`
   * says why: JSX gives every child the type `ReactElement<any, any>`), so this
   * stands as the tripwire for the day TypeScript can — on which the item below
   * stops compiling, this test fails, and the composition rule, the two doc
   * comments carrying it and `.scratch/command-dock/findings/`'s open call-site
   * entry are all owed a rewrite.
   */
  it('does not hold an unbound item to the group, which is why callers bind', () => {
    const chosen: ('left' | 'right')[] = [];

    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup<'left' | 'right'>
            defaultValue="left"
            onValueChange={(next) => {
              expectTypeOf(next).toEqualTypeOf<'left' | 'right'>();
              chosen.push(next);
            }}
          >
            <DropdownMenuRadioItem value="left">Left</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="middle">Middle</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Middle' }));

    // The declaration says `'left' | 'right'`. The array holds neither.
    expect(chosen).toEqual(['middle']);
  });

  /**
   * A union survives the round trip, which is what `String()` destroyed: the
   * value came back as a bare `string` and had to be parsed again into one of
   * the things the menu had itself just rendered.
   */
  it('preserves a union value type through the group', () => {
    const chosen: ('left' | 'right')[] = [];

    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup<'left' | 'right'>
            defaultValue="left"
            onValueChange={(next) => {
              expectTypeOf(next).toEqualTypeOf<'left' | 'right'>();
              chosen.push(next);
            }}
          >
            <DropdownMenuRadioItem value="left">Left</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Right' }));

    expect(chosen).toEqual(['right']);
  });
});
