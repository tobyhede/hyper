import { useRef } from 'react';
import { Button } from './Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './components/dropdown-menu';
import { AliasIcon, ChevronDownIcon, PlusIcon, SpaceCardIcon } from './icons';

export interface AddCardControlProps {
  /** Create a detached Markdown Card at the visible centre, immediately. */
  readonly onAddCard: () => void;
  /** Open the Alias creation state, which creates nothing until a Target is chosen. */
  readonly onAddAlias: () => void;
  /** Open the Space Card creation state, which creates nothing until a Space is chosen. */
  readonly onAddSpaceCard: () => void;
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
}

/**
 * Creating a Card: one action, plus the kinds that need more than a click.
 *
 * A **split control**, and the split is the design rather than a layout choice.
 * Add Card completes an Edit on one activation — no placement mode, no ghost, no
 * creation draft — so putting it behind a menu would add a step to the common
 * action to make room for the rare one. The other two kinds cannot complete on
 * activation: neither an Alias without a Target nor a Space Card without a
 * Space is a valid Card, so each opens a creation state instead and both belong
 * on the other half. That is what the menu collects — not "the less common
 * kinds", but the kinds whose creation is a conversation.
 *
 * The menu is Base UI's, whose keyboard, focus-return and dismissal behaviour
 * this takes as given (docs/agents/ui.md). Nothing here re-implements any of it: the trigger
 * opens on Enter, Space and Arrow keys, the items move under the arrows, and
 * closing returns focus to the trigger — which is what a cancelled creation
 * state relies on having somewhere to go back to.
 */
export function AddCardControl({
  onAddCard,
  onAddAlias,
  onAddSpaceCard,
  disabled = false,
  keyShortcut,
}: AddCardControlProps) {
  /**
   * Whether this close is a chosen item rather than a dismissal.
   *
   * Base UI restores focus to the trigger when the menu closes, which is right for
   * every close *except* one that opened a surface: a creation state takes focus
   * onto its own picker as it mounts, and the menu's default restore would take
   * it straight back off again. The author would then be looking at a picker
   * they cannot type into. `finalFocus` declines that restore for this one
   * close; other closes retain Base UI's default.
   *
   * Both creation items set it, for the same reason and with the same one flag:
   * what the ref records is that *this* close opened a surface, not which item
   * did it, so a second kind needs no second piece of state.
   */
  const openedASurface = useRef(false);

  return (
    <div className="inline-flex items-stretch gap-[2px]">
      <Button
        variant="secondary"
        size="compact"
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
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          data-testid="add-card-menu"
          // Where a cancelled creation pane returns the caret. An address
          // rather than a ref the application holds: the module that decides
          // where an Edit continues has no framework and cannot name one, and
          // this control is only ever disabled — never unmounted — while the
          // pane that will return to it is up.
          data-continuation-control="add-card"
          // The glyph is `aria-hidden`, so this is the trigger's only
          // accessible name rather than a refinement of visible text.
          aria-label="More Card kinds"
          title="More Card kinds"
          disabled={disabled}
          // React Flow's live Space-key pan activation subscription reaches
          // this button beside the flow, so `.nokey` keeps Space available to
          // the control rather than activating canvas panning.
          className="nokey inline-flex cursor-pointer items-center justify-center rounded-[6px] rounded-l-none border border-border bg-secondary px-[6px] py-[6px] text-[13px] whitespace-nowrap text-foreground transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          finalFocus={() => {
            if (!openedASurface.current) return true;
            openedASurface.current = false;
            return false;
          }}
          className="min-w-[10rem]"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              data-testid="add-alias"
              onClick={() => {
                openedASurface.current = true;
                onAddAlias();
              }}
            >
              {/* Bare rather than a labelled `CardKindIcon`: the item's own
                  text already names the kind, and a second name would make the
                  menu item announce as "Alias Add Alias". */}
              <AliasIcon />
              Add Alias
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="add-space-card"
              onClick={() => {
                openedASurface.current = true;
                onAddSpaceCard();
              }}
            >
              {/* The same glyph `CardKindIcon` draws for `kind: 'space'`, so the
                  kind is recognisable here before it exists and on the Card
                  afterwards. Bare, as Add Alias above is, and for the same
                  reason. */}
              <SpaceCardIcon />
              Add Space Card
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
