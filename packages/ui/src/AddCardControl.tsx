import { useRef, type Ref } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Button } from './Button';
import { AliasIcon, ChevronDownIcon, PlusIcon } from './icons';

export interface AddCardControlProps {
  /** Create a detached Markdown Card at the visible centre, immediately. */
  readonly onAddCard: () => void;
  /** Open the Alias creation state, which creates nothing until a Target is chosen. */
  readonly onAddAlias: () => void;
  /** Whether Card authoring is available at all right now. */
  readonly disabled?: boolean;
  /**
   * The key that performs Add Card, for the control that performs it to
   * announce — `'C'` today, and absent where a caller binds nothing.
   *
   * Named by the caller rather than written here, because the binding itself
   * lives there: this package is presentation-agnostic and cannot see the
   * handler, so a literal would be an accessible promise it has no way to keep
   * and no way to notice breaking when the key moves.
   */
  readonly keyShortcut?: string;
  /**
   * The menu trigger, offered so a caller can put focus back on it.
   *
   * `finalFocus` below declines Base UI's own restore for the close that opens
   * a surface, which leaves the surface's owner holding the other half:
   * cancelling it has to return focus here, and only that owner knows when the
   * pane is gone and this button is enabled again. Named rather than forwarded
   * from the root, because it is this half of a split control — the half the
   * menu was opened from — and not the pair.
   */
  readonly menuTriggerRef?: Ref<HTMLButtonElement>;
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
 * The menu is Base UI's, whose keyboard, focus-return and dismissal behaviour
 * this takes as given (docs/agents/ui.md). Nothing here re-implements any of it: the trigger
 * opens on Enter, Space and Arrow keys, the items move under the arrows, and
 * closing returns focus to the trigger — which is what a cancelled Alias
 * creation state relies on having somewhere to go back to.
 */
export function AddCardControl({
  onAddCard,
  onAddAlias,
  disabled = false,
  keyShortcut,
  menuTriggerRef,
}: AddCardControlProps) {
  /**
   * Whether this close is a chosen item rather than a dismissal.
   *
   * Base UI restores focus to the trigger when the menu closes, which is right for
   * every close *except* one that opened a surface: the Alias creation state
   * takes focus onto its Target picker as it mounts, and the menu's default
   * restore would take it straight back off again. The author would then be
   * looking at a picker they cannot type into. `finalFocus` declines that
   * restore for this one close; other closes retain Base UI's default.
   */
  const openedASurface = useRef(false);

  return (
    <div className="inline-flex items-stretch gap-[2px]">
      <Button
        variant="secondary"
        data-testid="add-card"
        // The control that performs the shortcut is the one that announces it.
        // `undefined` leaves the attribute off entirely, which is the honest
        // answer for a caller that binds no key.
        aria-keyshortcuts={keyShortcut}
        disabled={disabled}
        onClick={onAddCard}
        className="gap-[0.35rem] rounded-r-none"
      >
        <PlusIcon />
        Add Card
      </Button>
      {/* A toolbar menu is non-modal: nothing behind it is unusable while it is
          open, and its Alias action may open a surface that takes focus. */}
      <Menu.Root modal={false}>
        <Menu.Trigger
          ref={menuTriggerRef}
          data-testid="add-card-menu"
          // The glyph is `aria-hidden`, so this is the trigger's only
          // accessible name rather than a refinement of visible text.
          aria-label="More Card kinds"
          title="More Card kinds"
          disabled={disabled}
          className="inline-flex cursor-pointer items-center justify-center rounded-[6px] rounded-l-none border border-[var(--border)] bg-[var(--panel-2)] px-[0.4rem] py-[0.4rem] text-[0.85rem] whitespace-nowrap text-[var(--text)] transition-colors hover:border-[var(--accent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronDownIcon />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={4}>
            <Menu.Popup
              finalFocus={() => {
                if (!openedASurface.current) return true;
                openedASurface.current = false;
                return false;
              }}
              className="nokey z-50 min-w-[10rem] rounded-[6px] border border-[var(--border)] bg-[var(--panel)] p-[0.25rem] text-[var(--text)] shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
            >
              <Menu.Item
                data-testid="add-alias"
                onClick={() => {
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
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
