/**
 * Where focus goes when a `CardPane` opens, when its first focusable is the
 * wrong answer. The Alias creation state opens on its Target picker, which the
 * storyboard draws *below* the title it is more urgent than.
 *
 * A module of its own, holding both halves of one contract: the selector the
 * pane queries with, and the props a field declares itself with. They are two
 * modules apart otherwise, with nothing in the type system joining them — a
 * field carrying `data-pane-focu` and a pane querying `[data-pane-focus]`
 * typecheck, lint, render, and simply put focus somewhere else. Written here
 * once, neither side can drift from the other.
 *
 * Not exported from `CardPane` itself, where it began: `react-refresh` holds a
 * component module to exporting components only, and the rule is right — a
 * constant re-exported from there costs the pane its Fast Refresh.
 */
const PANE_INITIAL_FOCUS_ATTRIBUTE = 'data-pane-focus';

/** What `CardPane` looks for. */
export const PANE_INITIAL_FOCUS = `[${PANE_INITIAL_FOCUS_ATTRIBUTE}]`;

/**
 * Declare a field the pane's initial focus.
 *
 * `false` answers no props at all, which leaves the attribute off and the pane
 * on its ordinary fallback — its first focusable, in document order.
 */
export const paneInitialFocus = (declared: boolean): Record<string, string> =>
  declared ? { [PANE_INITIAL_FOCUS_ATTRIBUTE]: '' } : {};
