import type { Move } from '../navigation';

export interface PresentingChromeProps {
  /** The moves available from the active card, with the selected one marked. */
  moves: readonly Move[];
  /** Whether the traversalHistory can go back — false on the card it started from. */
  canRetreat: boolean;
  onSelect: (index: number) => void;
  onAdvance: () => void;
  onExit: () => void;
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
 * A line renders as a one-item list: the degenerate fork, not a second mode.
 * A sink renders as none, which is how the traversalHistory says it has ended.
 */
export function PresentingChrome({
  moves,
  canRetreat,
  onSelect,
  onAdvance,
  onExit,
}: PresentingChromeProps) {
  return (
    <div className="presenting" data-testid="presenting-chrome">
      <div className="presenting__moves">
        {moves.length === 0 ? (
          <p className="presenting__end" data-testid="presenting-end">
            End of the graph
          </p>
        ) : (
          <ul className="presenting__list" data-testid="presenting-moves">
            {moves.map((move, index) => (
              <li key={move.cardId}>
                <button
                  type="button"
                  className="presenting__move"
                  data-selected={move.selected}
                  data-card-id={move.cardId}
                  onClick={() => (move.selected ? onAdvance() : onSelect(index))}
                >
                  {move.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="presenting__keys">
        {moves.length > 1 && <span>↑ ↓ choose · </span>}
        {moves.length > 0 && <span>→ go · </span>}
        {canRetreat && <span>← back · </span>}
        <span>Esc overview</span>
      </p>

      <button
        type="button"
        className="presenting__exit"
        data-testid="exit-presenting"
        onClick={onExit}
      >
        Overview
      </button>
    </div>
  );
}
