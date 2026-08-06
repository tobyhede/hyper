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
    <div className="placement-status" role="alert">
      <div className="placement-status__panel">
        <h2>Unable to arrange this view</h2>
        {/* The panel bounds this at 40vh and scrolls it, so it needs to take
            focus or a keyboard-only reader cannot reach the rest of a long
            failure. Focusable scroll regions need a name. */}
        <pre tabIndex={0} aria-label="Placement failure detail">
          {error.message}
        </pre>
      </div>
    </div>
  );
}
