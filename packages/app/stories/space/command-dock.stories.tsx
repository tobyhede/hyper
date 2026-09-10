/**
 * The Command Dock: the Space's one command surface (ADR 0082).
 *
 * The component is `#components/CommandDock` and the state behind it is
 * `CommandDockFixture`'s, so these stories choose a situation and nothing else.
 * They were a staged prototype under `stories/review` while the arrangement was
 * being decided; the arrangement is decided, the application mounts it, and the
 * comparisons that got it here are recorded in `.scratch/command-dock/` rather
 * than carried as dead exports.
 *
 * Each export below is production-parity evidence and owes a Ladle behaviour
 * test and an application test (ADR 0052, `parity-claims.ts`).
 *
 * Every one is framed. The Dock docks to the *container's* edges and the
 * container is the viewport-sized canvas, so it draws in its own frame rather
 * than inside the catalogue's layout, where Ladle's toolbar lands on top of it.
 * `iframed` is written out on each story because Ladle parses `meta` statically
 * and rejects anything that is not an object literal.
 */
import type { Story } from '@ladle/react';
import { snapshotFromSpace } from '#src/snapshot';
import { CommandDockFixture, useCommandDockChrome } from '../support/CommandDockFixture';
import { commandDockSnapshot, newSpaceFixture } from '../support/spaces';

export default { title: 'Space/Command Dock' };

/**
 * The Dock over a Space three crossings in, with a branch open beside it.
 *
 * The whole command set at rest: which Space, which Layout and which Graph, each
 * naming the current one, disclosing the set and promoting at most one verb —
 * then the Cards. The parent step names one Space back and the Open Spaces menu
 * holds the rest.
 *
 * Drag a Card out of the Cards popover onto the canvas, or press the row where
 * it stands. Both are real and both are the same Edit: the Card joins the
 * Layout and the popover stays open, so the next one costs nothing either way.
 * Drag the dock by its grip to any edge, or press the grip and pick a slot.
 */
export const Default: Story = () => <CommandDockFixture chrome={useCommandDockChrome()} />;
Default.meta = { iframed: true };

/**
 * The same Dock on a side edge, which is the arrangement worth looking at
 * rather than dragging to.
 *
 * A second story and not a second dock: the JSX is the same, the edge is the
 * only difference, and the point is that a vertical dock is a column of
 * `[name] [v]` rows rather than a rail of icons. Its disclosures open into the
 * canvas, away from the edge it is against.
 */
export const DockedLeft: Story = () => (
  <CommandDockFixture chrome={useCommandDockChrome()} initialEdge="left" />
);
DockedLeft.meta = { iframed: true };

/**
 * A Space opened directly, never crossed out of, and freshly minted.
 *
 * Two obligations in one situation. ADR 0079 and ADR 0080 make a new Space
 * complete — one Layout, one empty Active Graph — and the Dock has to name both
 * rather than leave a cluster blank; and a session that has never crossed is the
 * one shape where the bar carries neither a parent step nor a Open Spaces menu,
 * so the Space cluster stands alone with no divider in front of it.
 *
 * Present is unavailable, because an empty Graph has nothing to traverse.
 */
export const NewSpace: Story = () => (
  <CommandDockFixture
    chrome={useCommandDockChrome(undefined, 'here', snapshotFromSpace(newSpaceFixture))}
  />
);
NewSpace.meta = { iframed: true };

/**
 * Presenting, where the whole surface goes.
 *
 * The Sidebar withdrew authoring command by command — Rename and Delete left a
 * Layout row's menu while its address stayed. The Dock does not have that
 * problem to solve: it is furniture over the paper, so presenting removes the
 * furniture. What the audience is left with is the canvas and
 * `PresentingChrome`, which carries the way out.
 */
export const Presenting: Story = () => {
  const chrome = useCommandDockChrome();
  return (
    <CommandDockFixture chrome={{ ...chrome, graph: { ...chrome.graph, presenting: true } }} />
  );
};
Presenting.meta = { iframed: true };

/**
 * The Dock at phone width.
 *
 * ADR 0082 took the Sidebar's free responsive story away with the primitive, and
 * this is what replaced it. There is no Sheet to dismiss and no command that has
 * to dismiss one, because the surface never took the canvas away — it is capped
 * to its container and scrolls along its own axis, so every cluster keeps its
 * name, its place in the roving order and its disclosure at 390px.
 *
 * The narrow frame is the story's, not a breakpoint the component carries: the
 * cap is against the container the Dock docks in, so a narrow container is the
 * whole of the case.
 */
export const Narrow: Story = () => (
  <div className="h-screen w-[390px] overflow-hidden">
    <CommandDockFixture chrome={useCommandDockChrome()} />
  </div>
);
Narrow.meta = { iframed: true };

/* ------------------------------------------------------------- when it fails */

/**
 * **A commit that failed on the Space you are looking at.**
 *
 * `PersistenceNotice` unchanged — production's own standing `Alert`, its own
 * sentence, its own Retry — hung off the Dock on the side its menus open on, so
 * it follows the surface to any of the twelve slots. It is a sibling of the
 * toolbar rather than an item in it: status is not a command (ADR 0082), and a
 * standing `Alert` inside `role="toolbar"` is exactly that.
 *
 * The canvas stays live behind it on purpose: a retryable failure leaves the
 * local work intact and the next commit may succeed on its own, so blocking the
 * paper would overstate it.
 *
 * And **there is no saving cue anywhere in the Dock**, in this story or any
 * other. That is the decision: a commit settles faster than a spinner can be
 * read, so the states worth drawing are the three that need a reader.
 */
export const SaveFailed: Story = () => (
  <CommandDockFixture
    chrome={useCommandDockChrome({
      kind: 'failed',
      failure: {
        kind: 'retryable-failure',
        code: 'network',
        message: 'The space could not be reached.',
      },
    })}
  />
);
SaveFailed.meta = { iframed: true };

/*
 * Hoisted rather than written in the story body, for the reason
 * `space/messaging.stories.tsx` gives: `PersistenceControl` separates two
 * rejections by the identity of the failure the session published, which is
 * what lets it draw a second failure equal by value to a dismissed one. A
 * literal inside the body mints a fresh object every render, so a Ladle theme
 * or width toggle would read as a new rejection and re-raise a dialog the
 * author had dismissed.
 */
const DOCK_REJECTED = {
  kind: 'rejected',
  failure: { kind: 'permanent-failure', code: 'forbidden', message: 'Permission denied' },
} as const;

/**
 * **A rejection, which is final and has to be acknowledged.**
 *
 * `PersistenceControl`'s `AlertDialog`, portalled and owning the viewport — so
 * unlike the notice it needs no placement at all, and where the Dock is sitting
 * is not part of the decision.
 */
export const SaveRejected: Story = () => (
  <CommandDockFixture chrome={useCommandDockChrome(DOCK_REJECTED)} />
);
SaveRejected.meta = { iframed: true };

/**
 * **A conflict, which blocks until local or stored work is chosen.**
 *
 * The same production `AlertDialog`, and the same reason it needs no placement:
 * a conflict has no safe dismissal, so it owns the viewport wherever the
 * furniture is.
 */
export const SaveConflict: Story = () => (
  <CommandDockFixture
    chrome={useCommandDockChrome({
      kind: 'conflicted',
      current: {
        snapshot: { ...commandDockSnapshot, document: { version: 1, title: 'Rendering' } },
        revision: 5n,
        exportedRevision: null,
      },
      baseline: undefined,
    })}
  />
);
SaveConflict.meta = { iframed: true };

/**
 * **A Space that went wrong while the reader was somewhere else.**
 *
 * The strip is over `Rendering`, which is fine; `Design system` — the Space one
 * step up — is the one whose commit failed. ADR 0082 binds the surface to name
 * which open Space is unwell, and the Open Spaces menu is where it says so: the
 * row that names it carries a dot at its trailing edge and the sentence in an
 * `sr-only` span, so the state is never colour alone.
 *
 * The row says *which*, and nothing else. The recovery belongs to that Space's
 * own Dock, one press away — the Open Spaces menu is a way to Spaces, not a
 * place to repair one.
 */
export const SaveFailedElsewhere: Story = () => (
  <CommandDockFixture
    chrome={useCommandDockChrome(
      {
        kind: 'failed',
        failure: {
          kind: 'retryable-failure',
          code: 'network',
          message: 'The space could not be reached.',
        },
      },
      'elsewhere',
    )}
  />
);
SaveFailedElsewhere.meta = { iframed: true };
