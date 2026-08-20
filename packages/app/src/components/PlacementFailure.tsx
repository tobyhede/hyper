import { StatusFailure } from '@project/ui';

/**
 * The canvas when no strategy produced positions.
 *
 * There is no arrangement to fall back to and nothing to author against, so the
 * strategy's own message is all the author has to go on — shown whole rather
 * than summarised, because it may name every unresolved id at once. Deciding to
 * draw this belongs to `canvasContent`, one seam lower.
 */
export function PlacementFailure({ error }: { error: Error }) {
  return (
    <StatusFailure
      className="h-full"
      title="Unable to arrange this view"
      detail={error.message}
      detailLabel="Placement failure detail"
    />
  );
}
