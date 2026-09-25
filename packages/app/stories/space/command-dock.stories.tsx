/**
 * The Command Dock over the production application (ADR 0082).
 *
 * **`iframed` is written out on every story below, and cannot be factored out.**
 * Ladle parses each `meta` statically and rejects anything that is not an object
 * literal, so a shared constant — or a spread of one — compiles and then silently
 * stops iframing these stories. The repetition is the constraint, not an oversight.
 */
import type { Story } from '@ladle/react';
import { CommandDockFixture, LeftDockFixture } from '../support/CommandDockFixture';

export default { title: 'Space/Command Dock' };

/**
 * The Dock over a Space three crossings in, with a branch open beside it.
 *
 * The whole command set at rest: which Space, which Map and which Graph, each
 * naming the current one, disclosing the set and promoting at most one verb —
 * then the Resources. The Opener control names the Space this one was entered from and the Open Spaces menu
 * holds the rest, Meta first. The Spaces trigger and Meta's row draw the OPEN
 * mark; the Space you are in draws a cube.
 *
 * Drag a Resource out of the Resources popover onto the canvas, or press the row where
 * it stands. Both are real and both are the same Edit: the Resource joins the
 * Map and the popover stays open, so the next one costs nothing either way.
 * Drag the dock by its grip to any edge, or press the grip and pick a slot.
 */
export const Default: Story = () => <CommandDockFixture />;
Default.meta = { iframed: true };

/** The same application after choosing the left edge from the Dock position menu. */
export const DockedLeft: Story = () => <LeftDockFixture />;
DockedLeft.meta = { iframed: true };

/**
 * A Space opened directly, never crossed out of, and freshly minted.
 *
 * Two obligations in one situation. ADR 0079 and ADR 0080 make a new Space
 * complete — one Map, one empty Active Graph — and the Dock has to name both
 * rather than leave a cluster blank; and a Space opened by its own address has
 * no Opener, so the Open Spaces menu is its one way to Meta. Meta is not
 * open here, and the menu still lists it first.
 *
 * Present is unavailable, because an empty Graph has nothing to traverse.
 */
export const NewSpace: Story = () => <CommandDockFixture scenario="new-space" />;
NewSpace.meta = { iframed: true };

/**
 * Presenting, where the whole surface goes.
 *
 * The Sidebar withdrew authoring command by command — Rename and Delete left a
 * Map row's menu while its address stayed. The Dock does not have that
 * problem to solve: it is furniture over the paper, so presenting removes the
 * furniture. What the audience is left with is the canvas and
 * `PresentingChrome`, which carries the way out.
 *
 * Real Navigation presents the Active Graph, so the chrome is the application's.
 */
export const Presenting: Story = () => <CommandDockFixture scenario="presenting" />;
Presenting.meta = { iframed: true };

/** Container width is fixture furniture; the application's responsive behavior is unchanged. */
export const Narrow: Story = () => (
  <div className="h-screen w-[390px] overflow-hidden">
    <CommandDockFixture />
  </div>
);
Narrow.meta = { iframed: true };

/** Backend outcomes pass through real sessions; recovery performs real commits. */
export const SaveFailed: Story = () => <CommandDockFixture scenario="save-failed" />;
SaveFailed.meta = { iframed: true };

/** A permanently rejected save: the Dock names the Space and offers no retry. */
export const SaveRejected: Story = () => <CommandDockFixture scenario="save-rejected" />;
SaveRejected.meta = { iframed: true };

/**
 * A refused aggregate: the backend declined the whole aggregate rather than
 * this Space's request (ADR 0057, `v1-release/17`), a distinct persistence
 * state that draws the same one-sentence dialog and, like a rejection, offers
 * no retry.
 */
export const SaveRefused: Story = () => <CommandDockFixture scenario="save-refused" />;
SaveRefused.meta = { iframed: true };

/**
 * A save over the request size limit: the notice explains it beside Retry
 * rather than a dialog, because reducing content and retrying is the recovery
 * and the Edits stay until a save fits.
 */
export const SaveTooLarge: Story = () => <CommandDockFixture scenario="save-too-large" />;
SaveTooLarge.meta = { iframed: true };

/**
 * A save another Space blocks: the rejected Space's recovery replay was refused
 * because the Space it names has a conflict of its own to resolve first. The
 * notice names that Space, opens it, and offers Retry once it is resolved.
 */
export const SaveBlocked: Story = () => <CommandDockFixture scenario="save-blocked" />;
SaveBlocked.meta = { iframed: true };

/** A conflicting save: recovery is resolve-conflict rather than retry. */
export const SaveConflict: Story = () => <CommandDockFixture scenario="save-conflict" />;
SaveConflict.meta = { iframed: true };

/** The unwell Space is one crossing up, so the Dock names it rather than the canvas. */
export const SaveFailedElsewhere: Story = () => (
  <CommandDockFixture scenario="save-failed-elsewhere" />
);
SaveFailedElsewhere.meta = { iframed: true };
