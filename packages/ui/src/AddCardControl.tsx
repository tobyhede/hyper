import { useRef } from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Button } from './Button';
import { AliasIcon, ChevronDownIcon, PlusIcon } from './icons';

export interface AddCardControlProps {
  /** Create a detached Markdown Card at the visible centre, immediately. */
  readonly onAddCard: () => void;
  /** Open the Alias creation state, which creates nothing until a Target is chosen. */
  readonly onAddAlias: () => void;
  /** Whether Card authoring is available at all right now. */
  readonly disabled?: boolean;
}

/**
 * Creating a Card: one action, plus the kinds that need more than a click.
 *
 * A **split control**, and the split is the design rather than a layout choice.
 * Add Card completes an Edit on one activation — no placement mode, no ghost, no
 * creation draft — so putting it behind a menu would add a step to the common
 * action to make room for the rare one. Add Alias cannot complete on activation,
 * because an Alias without a Target is not a valid Card, so it opens a creation
 * state instead and belongs on the other half.
 *
 * The menu is Radix's, whose keyboard, focus-return and dismissal behaviour this
 * takes as given (AGENTS.md). Nothing here re-implements any of it: the trigger
 * opens on Enter, Space and Arrow keys, the items move under the arrows, and
 * closing returns focus to the trigger — which is what a cancelled Alias
 * creation state relies on having somewhere to go back to.
 */
export function AddCardControl({ onAddCard, onAddAlias, disabled = false }: AddCardControlProps) {
  /**
   * Whether this close is a chosen item rather than a dismissal.
   *
   * Radix restores focus to the trigger when the menu closes, which is right for
   * every close *except* one that opened a surface: the Alias creation state
   * takes focus onto its Target picker as it mounts, and the restore — which
   * Radix runs from a `setTimeout` in the focus scope's cleanup, so it lands
   * after — takes it straight back off again. The author is then looking at a
   * picker they cannot type into.
   *
   * `onCloseAutoFocus` is the documented way to decline that, and declining it
   * per-close rather than always is what keeps an Escape or an outside click
   * returning focus to the trigger the way Radix means them to.
   */
  const openedASurface = useRef(false);

  return (
    <div className="inline-flex items-stretch gap-[2px]">
      <Button
        variant="secondary"
        data-testid="add-card"
        // `C` is the only unmodified authoring shortcut, so the control that
        // performs it is the one that names it.
        aria-keyshortcuts="C"
        disabled={disabled}
        onClick={onAddCard}
        className="gap-[0.35rem] rounded-r-none"
      >
        <PlusIcon />
        Add Card
      </Button>
      {/* Non-modal, which is what lets an item open a surface at all. A modal
          Radix menu traps focus in its own content until it unmounts, and it
          unmounts a commit *after* the item's `onSelect` — so the pane opened by
          the item took focus and had it pulled straight back into a menu that
          was on its way out, landing on `<body>` when that menu went. A toolbar
          menu is not modal in any case: nothing behind it is unusable while it
          is open. */}
      <DropdownMenuPrimitive.Root modal={false}>
        <DropdownMenuPrimitive.Trigger asChild>
          <Button
            variant="secondary"
            data-testid="add-card-menu"
            // The glyph is `aria-hidden`, so this is the trigger's only
            // accessible name rather than a refinement of visible text.
            aria-label="More Card kinds"
            title="More Card kinds"
            disabled={disabled}
            className="rounded-l-none px-[0.4rem]"
          >
            <ChevronDownIcon />
          </Button>
        </DropdownMenuPrimitive.Trigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            align="end"
            sideOffset={4}
            onCloseAutoFocus={(event) => {
              if (!openedASurface.current) return;
              openedASurface.current = false;
              event.preventDefault();
            }}
            className="z-50 min-w-[10rem] rounded-[6px] border border-[var(--border)] bg-[var(--panel)] p-[0.25rem] text-[var(--text)] shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
          >
            <DropdownMenuPrimitive.Item
              data-testid="add-alias"
              onSelect={() => {
                openedASurface.current = true;
                onAddAlias();
              }}
              className="flex cursor-pointer items-center gap-[0.5rem] rounded-[4px] px-[0.5rem] py-[0.35rem] text-[0.85rem] outline-none select-none data-[highlighted]:bg-[var(--panel-2)]"
            >
              {/* Bare rather than a labelled `CardKindIcon`: the item's own
                  text already names the kind, and a second name would make the
                  menu item announce as "Alias Add Alias". */}
              <span className="text-[var(--muted)]">
                <AliasIcon />
              </span>
              Add Alias
            </DropdownMenuPrimitive.Item>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenuPrimitive.Root>
    </div>
  );
}
