# The retryable story draws the Space its session holds

Status: resolved

Surfaced by: issue 02's design loop. Deferred there deliberately, with the
cheaper option taken. Settled by a grilling loop on 2026-08-19; the rejected
options are recorded under "Decided" so none is re-opened.

Blocked by: issue 02. It adds the `space: Space` prop and
`stories/support/spaces.ts`. Start this on a fresh branch after issue 02 lands.

## The defect

`packages/app/stories/support/WorkspaceSidebarFixture.tsx` holds two Spaces that
never meet:

```
[B] retrySnapshot ──▶ session ──▶ { persistence, acknowledgedRevision } ──┐
                                                                          ▼
[A] authoredSpace ─────────────────────────────────────────▶ WorkspaceSidebar
```

`RetryableWorkspaceSidebarFixture` opens a real `MemorySpaceBackend` session
over `retrySnapshot`. That snapshot holds no Cards and is titled
`Retry lifecycle`. The session queues a failure for its first commit and
submits. The sidebar beside it draws `authoredSpace` and reads only
`persistence`, `acknowledgedRevision` and `retry` from the session. It never
reads the Space the session holds.

The Failed story therefore reports "revision 1 saved" beside a list of content
that was never in that save. Each half is tested on its own, so no test fails.
The story is still wrong about the product.

Before issue 02 nobody was tempted to merge the two, because the drawn thing was
three loose arrays rather than a Space. Afterwards both are `Space`-shaped and
sit in one file.

## What to build

Draw the sidebar from the session:

```
authoredSnapshot ──▶ session ──┬──▶ persistence ──────────────────────────┐
                               │                                          ▼
                               └──▶ working ──▶ readWorkingSpace ──▶ WorkspaceSidebar
```

The Failed story then proves one claim: **a failed save keeps the unsaved work
on screen.** The session submits more than it loaded, so the drawn list carries
a row the failed commit never stored, and keeps it when the retry succeeds.

## Changes

**`packages/app/package.json`.** Add one entry to `imports`:
`"#src/*": "./src/*.ts"`. It has the same shape as the three entries already
there. The fixture needs it because `no-restricted-imports` refuses a path that
starts with `../../`, and `stories/support` is two directories below the package
root.

**`packages/app/stories/support/spaces.ts`** (created by issue 02). Export the
`SpaceSnapshot` literal it already parses, as `authoredSnapshot`, beside
`authoredSpace`. One literal, two exports.

**`packages/app/stories/support/WorkspaceSidebarFixture.tsx`.** Delete
`retrySnapshot`. `RetryableWorkspaceSidebarFixture` opens its session over
`authoredSnapshot`, and submits `authoredSnapshot` with one more Layout titled
`Collection 3`. `positionedLayoutSchema` requires a title, positions naming
Cards the Space holds, and at least one Graph, so the third Layout reuses the
two Cards already in the snapshot and owns one Graph with one Edge between
them.

The fixture builds one `createWorkingSpaceReader()` from `#src/snapshot`, reads
`state.working` through it, and passes the result as the `space` prop. The
reader caches on snapshot identity, so a re-render does not parse again and does
not hand `canvasChoice` a new `Space`. The fixture's props do not change: this
is an edit inside one function, not a new interface.

**`packages/app/ladle-e2e/issue-14-workspace-sidebar.spec.ts`.** In the Failed
story, assert that `Collection 3` is visible while the failure notice is
visible, and that it is still visible after Retry succeeds. The existing
revision and notice assertions stand.

## The paired proof (ADR 0052)

The application half of this claim exists already:
`keeps persistence failure visible, accepts another Edit, and retries the latest
Space`, in `packages/app/test/space-authoring.test.ts`. It queues a network
failure, accepts a second Edit while the failure stands, and proves the retry
sends the newest working state. Name it in the story comment as the pair. The
story proves that the sidebar draws that state; the unit test proves that the
state survives.

## Acceptance

- [x] `RetryableWorkspaceSidebarFixture` draws the Space its own session holds, and `retrySnapshot` is gone.
- [x] The drawn Space comes from `createWorkingSpaceReader`, not from a second call to `loadSpaceSnapshot`.
- [x] `packages/app/package.json` gains `"#src/*"`, and no story imports a path starting with `../../`. Issue 02 landed the entry; nothing further was needed.
- [x] The submitted snapshot differs from the loaded one by the `Collection 3` Layout, and that Layout passes `positionedLayoutSchema`.
- [x] The Ladle spec proves `Collection 3` is drawn during the failure and after the retry.
- [x] The story comment names the application test that pairs with the claim.
- [x] The other six stories and the fixture's props are unchanged.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

## Answer

Built on `retryable-story-space`, off `the-canvas-choice-is-one-module`.

`spaces.ts` exports the literal it already parsed as `authoredSnapshot` and adds
`editedSnapshot` beside it — the same literal one Edit later, with a third
Layout `Collection 3` positioning three Cards the Space already holds and owning
one Graph, `Trail`, over two of the spine's Edges. The Edit **appends**: the
fixture seeds `selected` from the first Space through a `useState` initializer
and never reconciles it, so an Edit that withdrew the opened Layout would make
`canvasChoice` throw on the second render, with no boundary above it.

`RetryableWorkspaceSidebarFixture` opens its session over `authoredSnapshot`,
submits `editedSnapshot`, and passes `readWorkingSpace(state.working)` as the
`space` prop through one `createWorkingSpaceReader`. `retrySnapshot` is gone,
the fixture's props are unchanged, and the other six stories are untouched.

Three proofs around the one claim, none of them the other two:

- `story-spaces.test.ts` holds the Edit to appending — the opened Layout
  survives it, and the earlier Layouts still come first. That is what keeps the
  story renderable at all.
- `RetryableWorkspaceSidebar.test.tsx` renders the story, waits for the failure
  notice, and asserts `Collection 3` is drawn there and still drawn once Retry
  settles at revision 1. Proven against the defect rather than only against the
  fix: dropping the `space` prop again fails it with the notice up and no such
  row.
- `issue-14-workspace-sidebar.spec.ts` presses the same two visibilities in a
  browser. The unit test is there as well because `pnpm verify` does not run
  Ladle.

The same finding also arrived as a review comment on issue 02's branch and was
implemented there independently; that duplicate was dropped in favour of this
branch, which the render test above came from.

## Decided, so it is not re-opened

- **Only the Failed story.** The other six show a list and an indicator, not a
  save lifecycle. A session gives them no production behaviour they lack. ADR
  0052 asks for the smallest production boundary that owns the behaviour the
  story claims.
- **Not the Conflicted story.** Its Reload button is `acceptStoredSpace`, which
  lives on Space Authoring and needs Navigation, a renderer resolver and a
  placement. A session alone cannot make that story honest, and composing all of
  that is a separate ticket.
- **Not `loadSpaceSnapshot` in the fixture.** That is a second copy of the state
  translation the application already owns, which ADR 0052 refuses, and it drops
  the identity cache.
- **No refusal branch.** `loadSpaceSnapshot` can refuse, but `spaces.ts` parses
  its literal when the module loads, so the story cannot reach a refusal. The
  reader throws, exactly as the application does. An error surface in the fixture
  would be behaviour production does not have. An error boundary would be worse:
  production returns a message string from a click handler *because* a boundary
  does not catch a handler throw, so a boundary here would show a surface the
  application never shows.
- **No new browser proof.** `test/support/e2e-memory-space-repository.ts` cannot
  inject a commit failure, so an application e2e proof of this claim needs a test
  control on the production HTTP path. That is a larger change than this one, and
  issue 08 owns the parity inventory.
- **The Failed story is not deleted.** It is the only story that shows a failure
  notice above a workspace.
- **Not `snapshotFromSpace(authoredSpace)`.** The literal is three lines above
  the export; a round trip through a second production module to recover it buys
  nothing.
- **Not an unchanged submission.** If the story submits what it loaded, nothing
  observable changes, and no test would fail if a person reverted this ticket.

## Out of scope

- The hidden `persistence-status` span and the two props that feed it. That is
  candidate C of the same review, not yet raised as a ticket.
- Issue 08's parity manifest and its enforcement.
