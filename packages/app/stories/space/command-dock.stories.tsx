import type { Story } from '@ladle/react';
import { CommandDockFixture, LeftDockFixture } from '../support/CommandDockFixture';

export default { title: 'Space/Command Dock' };

/**
 * The Dock over a Space three crossings in, with a branch open beside it.
 *
 * The whole command set at rest: which Space, which Diagram and which Graph, each
 * naming the current one, disclosing the set and promoting at most one verb —
 * then the Cards. The parent step names one Space back and the Open Spaces menu
 * holds the rest.
 *
 * Drag a Card out of the Cards popover onto the canvas, or press the row where
 * it stands. Both are real and both are the same Edit: the Card joins the
 * Diagram and the popover stays open, so the next one costs nothing either way.
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
 * complete — one Diagram, one empty Active Graph — and the Dock has to name both
 * rather than leave a cluster blank; and a session that has never crossed is the
 * one shape where the bar carries neither a parent step nor a Open Spaces menu,
 * so the Space cluster stands alone with no divider in front of it.
 *
 * Present is unavailable, because an empty Graph has nothing to traverse.
 */
export const NewSpace: Story = () => <CommandDockFixture scenario="new-space" />;
NewSpace.meta = { iframed: true };

/**
 * Presenting, where the whole surface goes.
 *
 * The Sidebar withdrew authoring command by command — Rename and Delete left a
 * Diagram row's menu while its address stayed. The Dock does not have that
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

export const SaveRejected: Story = () => <CommandDockFixture scenario="save-rejected" />;
SaveRejected.meta = { iframed: true };

export const SaveConflict: Story = () => <CommandDockFixture scenario="save-conflict" />;
SaveConflict.meta = { iframed: true };

export const SaveFailedElsewhere: Story = () => (
  <CommandDockFixture scenario="save-failed-elsewhere" />
);
SaveFailedElsewhere.meta = { iframed: true };
