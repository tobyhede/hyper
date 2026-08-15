import { AliasIcon, EditIcon, LayoutIcon, MarkdownIcon, PlusIcon } from '@project/ui';

/**
 * The locked card, option `8a` "Flat" — the canvas node as the design settles
 * it, drawn statically so every state can be seen at once.
 *
 * **Not the product's card.** `CardNode` in `@project/react-flow-adapter` is,
 * and it is untouched. This is the proposal the inventory exists to review;
 * porting it is a separate change, and one that has to answer to React Flow's
 * handle measurement, the `nodrag`/`nopan` discipline and the title editor's
 * focus contract — none of which a static specimen is exercising.
 *
 * State is a prop rather than a CSS pseudo-class because an inventory has to
 * show `:hover` and a live drag without a pointer being there.
 */

export type CardFaceKind = 'markdown' | 'alias' | 'space';
export type CardFaceState = 'rest' | 'hover' | 'selected' | 'editing' | 'dragging';

const SIDES = ['top', 'right', 'bottom', 'left'] as const;

export interface CardFaceProps {
  readonly title: string;
  readonly kind?: CardFaceKind;
  readonly state?: CardFaceState;
  /** The Active Graph's colour: the rail fill, the handles, the title underline. */
  readonly graphColor?: string;
  /** An Alias draws its Target's title under its own. */
  readonly aliasOf?: string;
  /**
   * Whether the four spatial handles are drawn.
   *
   * Defaults to the design's rule — hover only. Upstream `styles.css` reveals
   * them on hover *and* selection, which is an unresolved disagreement rather
   * than an oversight on either side; `CardHandleRule` in `canvas.stories.tsx`
   * draws both so it can be settled by looking.
   */
  readonly handles?: boolean;
}

/**
 * The rail's third action. `@project/ui` has no ellipsis and Lucide's
 * `MoreHorizontal` is the obvious answer, but adding an icon to the shared
 * package for a proposal would put it in the product's vocabulary before the
 * proposal is accepted. Inline here, and listed as a finding.
 */
const MoreIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="currentColor">
    <circle cx="3" cy="7" r="1.35" />
    <circle cx="7" cy="7" r="1.35" />
    <circle cx="11" cy="7" r="1.35" />
  </svg>
);

const KindGlyph = ({ kind }: { kind: CardFaceKind }) => {
  if (kind === 'alias') return <AliasIcon size={15} />;
  // Stand-in. The design asks for a layers glyph; `LayoutIcon` is the nearest
  // thing `@project/ui` ships and means something else. Listed as a finding.
  if (kind === 'space') return <LayoutIcon />;
  return <MarkdownIcon size={15} />;
};

export function CardFace({
  title,
  kind = 'markdown',
  state = 'rest',
  graphColor = '#ffc53d',
  aliasOf,
  handles = state === 'hover',
}: CardFaceProps) {
  // The rail's fill follows `data-state` in CSS rather than a class computed
  // here, so the "filled in every state but rest" rule reads as one selector
  // list instead of a boolean that has to agree with one.
  const editing = state === 'editing';
  // Hidden on selection as well as at rest: a selected card is one the author is
  // about to act on from somewhere else, and three buttons appearing under the
  // pointer at the moment of selection is what the filled rail already says.
  const showActions = state === 'hover';

  return (
    <div
      className="inv-card"
      data-kind={kind}
      data-state={state}
      style={{ ['--graph-color' as string]: graphColor }}
    >
      <div className="inv-card__rail">
        <span className="inv-card__glyph">
          {editing ? <EditIcon /> : <KindGlyph kind={kind} />}
        </span>

        {showActions && (
          <span className="inv-card__actions">
            <button type="button" className="inv-card__action" aria-label={`Edit ${title}`}>
              <EditIcon />
            </button>
            <button type="button" className="inv-card__action" aria-label={`Connect from ${title}`}>
              <PlusIcon />
            </button>
            <button type="button" className="inv-card__action" aria-label={`More actions`}>
              <MoreIcon />
            </button>
          </span>
        )}

        {/* Takes the place the buttons had, so the rail's contents never move
            between the two states that both fill it. */}
        {editing && <span className="inv-card__hint inv-mono">⏎ · esc</span>}
      </div>

      <div className="inv-card__body">
        <h2 className={editing ? 'inv-card__title inv-card__title--editing' : 'inv-card__title'}>
          {title}
          {editing && <i className="inv-card__caret" aria-hidden="true" />}
        </h2>
      </div>

      {aliasOf !== undefined && (
        <p
          style={{
            margin: 0,
            padding: '0 12px 10px',
            fontSize: 12,
            color: 'var(--card-title-muted)',
          }}
        >
          {aliasOf}
        </p>
      )}

      {handles &&
        SIDES.map((side) => (
          <span key={side} className="inv-card__handle" data-side={side} aria-hidden="true" />
        ))}
    </div>
  );
}
