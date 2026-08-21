import { useEffect, useRef } from 'react';
import { Button, Kbd, KbdGroup } from '@project/ui';
import type { Move } from '../navigation';

export interface PresentingChromeProps {
  /** The moves available from the active card, with the selected one marked. */
  moves: readonly Move[];
  /** Whether Traversal history contains a previous Card — false on the starting Card. */
  canRetreat: boolean;
  /**
   * Move the selection by a signed number of places, which is Navigation's own
   * `selectBranch`.
   *
   * The chrome takes the delta rather than an index because it is the one that
   * knows where the selection currently sits in the list it drew: it renders
   * `moves` in order and marks one of them, so the arithmetic is a read of its
   * own output. App used to do it — `selectBranch(index - moves.findIndex(...))`
   * — which made the composition re-derive the list's shape to answer a question
   * about a control it does not draw.
   */
  onSelectBranch: (delta: number) => void;
  onAdvance: () => void;
  /** Traverse back, the same Navigation operation Arrow Left performs. */
  onRetreat: () => void;
  onExit: () => void;
}

/** Where focus is owed after a chrome-originated command destroys the control that ran it. */
type FocusDebt = 'traversed' | null;

/**
 * The commands available right now, in the order the guidance lists them.
 *
 * Only what the presenter can actually do: Up/Down needs something to choose
 * between, Right needs somewhere to go, Left needs somewhere to go back to.
 * Escape is unconditional — leaving presentation is always available.
 */
function availableCommands(
  moves: readonly Move[],
  canRetreat: boolean,
): readonly { readonly keys: readonly string[]; readonly action: string }[] {
  const commands: { readonly keys: readonly string[]; readonly action: string }[] = [];
  if (moves.length > 1) commands.push({ keys: ['↑', '↓'], action: 'choose' });
  if (moves.length > 0) commands.push({ keys: ['→'], action: 'go' });
  if (canRetreat) commands.push({ keys: ['←'], action: 'back' });
  commands.push({ keys: ['Esc'], action: 'overview' });
  return commands;
}

/**
 * The presenter's controls, fixed to the screen rather than drawn on the canvas.
 *
 * At a zoom where the active card is legible, a fork's branch cards are not in
 * frame — a neighbour cannot be both far enough off-axis to read as a direction
 * and close enough to stay in a 16:9 viewport (ADR 0027). That does not need
 * fixing on the canvas; what the presenter needs is to understand their options,
 * and enumerating them here does that while the camera still frames one card.
 *
 * A line renders as a one-item list: the degenerate fork, not a second mode
 * (ADR 0024). A sink renders as none, marking the end of this traversal. Zero,
 * one and many outgoing Edges are one mechanism — nothing here asks whether the
 * Graph is linear.
 *
 * **A move names the action it performs.** Choosing is not going: an unselected
 * move is `Choose <Title>` and selects without moving the camera, while the
 * selected one is `Go to <Title>` and commits. They are deliberately not radios,
 * toggles or disabled destinations — selection alone is not the completed
 * action, and every control here is a button that does what its name says.
 *
 * Controlled throughout. Navigation owns the moves, the selected branch,
 * Traversal history and every operation; this draws them and calls back.
 */
export function PresentingChrome({
  moves,
  canRetreat,
  onSelectBranch,
  onAdvance,
  onRetreat,
  onExit,
}: PresentingChromeProps) {
  const selectedIndex = moves.findIndex((move) => move.selected);
  const selectedMove = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const overview = useRef<HTMLButtonElement>(null);
  /**
   * Focus owed by a command this chrome started, and by nothing else.
   *
   * Advancing and retreating destroy the control that ran them — the move list
   * is rebuilt from the Card arrived at — so a pointer or keyboard user who
   * activated one here would be left on `<body>`. The debt is set in the
   * handler and paid in the effect below, once the replacement controls are in
   * the tree.
   *
   * It is deliberately **not** set for a traversal performed with the global
   * arrow keys: focus is wherever the presenter left it, and moving it into the
   * chrome merely because Navigation changed is exactly what the shared live
   * region exists to avoid.
   */
  const focusDebt = useRef<FocusDebt>(null);

  const traversed = (command: () => void) => (): void => {
    focusDebt.current = 'traversed';
    command();
  };

  useEffect(() => {
    if (focusDebt.current === null) return;
    focusDebt.current = null;
    // The newly selected move, or — at a sink — Back where there is one and
    // Overview otherwise. Each is the control that took the place of the one
    // just activated.
    (selectedMove.current ?? back.current ?? overview.current)?.focus();
  }, [moves, canRetreat]);

  // A bounded row scrolls rather than wraps, so the selected choice can be off
  // screen after an Up or Down that never touched the chrome.
  useEffect(() => {
    selectedMove.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedIndex, moves]);

  return (
    <div
      data-testid="presenting-chrome"
      // Its own container, so the responsive rule below reads the width the
      // chrome actually has rather than the viewport's: the workspace Sidebar
      // takes 16rem of it above the breakpoint and none below.
      className="@container absolute inset-x-0 bottom-0 z-20 border-t border-border bg-background/90"
    >
      <div className="flex items-center gap-4 p-3 @max-3xl:flex-col @max-3xl:items-stretch">
        {/*
          One polite region over both, because they are one thing: what the
          presenter can do from the Card they are on. A changed choice set is
          announced where it changed, without focus being moved to say it.
        */}
        <div
          role="status"
          aria-live="polite"
          // `role="status"` is atomic by default, which re-reads every choice
          // whenever any of them changes — four labels for one Arrow Down that
          // moved the selection by one. Announcing what changed is the whole
          // point of the region, so it says so.
          aria-atomic="false"
          data-testid="presenting-choices"
          className="min-w-0 flex-1"
        >
          {moves.length === 0 ? (
            <p data-testid="presenting-end" className="text-sm text-muted-foreground">
              End of Graph
            </p>
          ) : (
            <ul
              data-testid="presenting-moves"
              // `overflow-x-auto` clips vertically as well as horizontally, and
              // this row is where the chrome puts focus — so the padding has to
              // clear `Button`'s 2px focus outline at its 2px offset, or the
              // indicator this component goes out of its way to place lands
              // half-cut.
              className="flex [scrollbar-width:thin] gap-2 overflow-x-auto py-1.5"
            >
              {moves.map((move, index) => (
                <li key={move.cardId} className="shrink-0">
                  <Button
                    ref={move.selected ? selectedMove : null}
                    variant={move.selected ? 'default' : 'secondary'}
                    // The Card this move goes to. There is deliberately no
                    // `data-selected` beside it any more: which one is selected
                    // is in the control's own name and its variant, and a third
                    // spelling of it would be one a test could read while the
                    // other two said something else.
                    data-card-id={move.cardId}
                    // The action, not the destination. The visible text is the
                    // Card's title and the name is that title with the verb in
                    // front of it, so voice control can still say what is
                    // written on the control.
                    aria-label={`${move.selected ? 'Go to' : 'Choose'} ${move.title}`}
                    className="max-w-[16rem] @max-3xl:min-h-11"
                    onClick={
                      move.selected
                        ? traversed(onAdvance)
                        : () => onSelectBranch(index - selectedIndex)
                    }
                  >
                    {/* Truncation belongs on this span rather than on the
                        Button. `Button` is `inline-flex`, so a bare string is
                        an anonymous flex item that `text-overflow` never
                        reaches — a long title then overflows past *both* ends
                        of a centred button and is hard-clipped at each, losing
                        the beginning of the Card's name with no ellipsis to
                        say so. */}
                    <span className="min-w-0 truncate">{move.title}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3 @max-3xl:flex-wrap @max-3xl:justify-between">
          {canRetreat && (
            <Button
              ref={back}
              variant="secondary"
              data-testid="presenting-back"
              className="@max-3xl:min-h-11"
              onClick={traversed(onRetreat)}
            >
              Back
            </Button>
          )}

          <ul
            data-testid="presenting-keys"
            // Below the breakpoint the guidance drops to its own line under Back
            // and Overview rather than being withdrawn: the commands it lists
            // are still bound, and a presenter on a narrow screen may well have
            // a keyboard.
            className="flex items-center gap-3 text-xs text-muted-foreground @max-3xl:order-last @max-3xl:w-full @max-3xl:flex-wrap"
          >
            {availableCommands(moves, canRetreat).map((command) => (
              <li key={command.action} className="flex items-center gap-1.5 whitespace-nowrap">
                <KbdGroup>
                  {command.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </KbdGroup>
                {command.action}
              </li>
            ))}
          </ul>

          <Button
            ref={overview}
            variant="secondary"
            data-testid="exit-presenting"
            className="@max-3xl:min-h-11"
            onClick={onExit}
          >
            Overview
          </Button>
        </div>
      </div>
    </div>
  );
}
