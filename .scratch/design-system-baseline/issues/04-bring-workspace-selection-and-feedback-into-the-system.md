# 04 — Bring Space startup and operational feedback into the system

**What to build:** Present operational feedback through shared design-system surfaces, including busy, failure and persistence-refusal states.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** resolved

- [ ] ~~A Space choice is a clear reusable item/card treatment, including a usable loading state and an intentional empty state.~~ Superseded — see 2026-08-20 comment.
- [x] Startup and placement failures use a common accessible alert treatment without losing their diagnostic detail.
- [x] Ladle renders the actual feedback states rather than representative markup.

## Audit note

The current chooser story documents the production gaps rather than closing
them: rows remain bare buttons, the empty state is a heading over a void, and
the busy state has no visible progress. Treat that story as evidence of the
work still required, not acceptance of the surface.

## Answer

`@project/ui` gained one deep module, `StatusPanel.tsx`, exporting `StatusFailure`
and `StatusBusy` — the shared Alert- and Spinner-based framing the architecture
review's "Deepen operational feedback" candidate asked for. `StatusFailure` holds
the accessible failure contract in one place: an announced `Alert`, an optional
short description, and the raw diagnostic detail in a bounded, focusable, named
`role="region"` so a keyboard-only reader can reach a message naming every
unresolved id at once. `StatusBusy` pairs a decorative `Spinner` with a visible
label inside one `role="status"` region, replacing `PlacementPending`'s bare text
with real visible progress — closing the audit note's "busy state has no visible
progress" gap.

Three production call sites converge on it. `PlacementFailure` and
`PlacementPending` (`packages/app/src/components`) now compose `StatusFailure`/
`StatusBusy` directly. `startup.tsx`'s startup-failure render and `Workspace.tsx`'s
render-throw boundary each had their JSX extracted into their own presentational
components — `StartupFailure` and `WorkspaceFailureView` — so every state is a real,
independently mountable component a Ladle story can render without an imperative
`root.render` or a triggered error boundary standing in the way. The three
hand-rolled CSS blocks these replaced (`.startup-error*`, `.placement-status*`)
are deleted from `styles.css`; `.workspace-selection*` is untouched (see below).

`stories/components/operational-feedback.stories.tsx` mounts all four real
production components — `Startup`, `Workspace`, `Placement`, `Arranging` — closing
the "Ladle renders the actual feedback states rather than representative markup"
criterion. `packages/ui/test/StatusPanel.test.tsx` proves the shared contract;
`packages/app/ladle-e2e/operational-feedback.spec.ts` proves all four production
states render through the real catalogue. The pre-existing `startup.test.tsx`,
`Workspace.test.tsx`, `PlacementFailure.test.tsx` and `PlacementPending.test.tsx`
application tests were kept passing rather than rewritten — two assertions that
queried a synthetic `role="heading"` were changed to query the announced Alert's
text directly, since that heading was never a deliberate contract and the shared
Alert primitive `PersistenceControl` already established doesn't use one either;
converging on that existing accepted pattern was the point.

**Struck criterion confirmed out of scope, not attempted:** `WorkspaceSelection.tsx`
and its `.workspace-selection*` CSS are untouched. It is scheduled for outright
deletion by `.scratch/space-cards/issues/04-retire-workspace-selection.md` (blocked
on that stream's own issue 03), and touching its busy/empty markup now would be
wasted work against a component with no future here.

**Not attempted: a parity-manifest claim for the new story.** `@project/app`
carries no such mechanism on `main` as of this work — `scripts/ui-catalog.ts` only
validates exports and story taxonomy (Issue 08's audit note). A dual Ladle+application
Playwright-evidence system did exist in this working tree mid-session as separate,
uncommitted, in-progress work, but it was gone (reverted to `HEAD`) before this
ticket's changes were verified, so there was nothing live to register against.

Verification: `pnpm verify` is green except one pre-existing, unrelated
`anti-slop/no-unknown-parameters` finding in
`packages/react-flow-adapter/src/elk/elk-strategy.ts:40` (confirmed present on a
clean `main` checkout before this work; not introduced here). `pnpm e2e` (98
passed) and `pnpm e2e:ladle` (17 passed, including the four new stories) are both
green.

## Comments

### 2026-08-20 — the Space chooser is retired, not designed

ADR 0058 (`.scratch/space-cards/issues/02-grill-space-card-model.md`) deletes
`WorkspaceSelection` outright: a Space is now reached by opening the Space
Card that owns it, the same as any other nested content, and the root Space
ADR 0018 already bootstraps always exists — there is no more 0-or-N-Spaces
moment at startup to choose between. The struck criterion above has no
component left to design. The item/card visual treatment it named already has
a home in `.scratch/space-cards/issues/01-render-a-space-card-as-a-sub-flow.md`
(rendering a Space Card as a Card, not a chooser row). This ticket's remaining
scope — busy/failure/persistence-refusal feedback for loading the one root
Space — is unaffected. Renamed off "workspace selection" per the same
decision's retirement of "workspace" as a word (see `CONTEXT.md`'s Space
entry).

### 2026-08-18 — a visible persistence cue label is this ticket's call

Under ADR 0053 the persistence cue moves into the Sidebar footer, where there is
room for the label `PersistenceIndicator` currently states only through its
`aria-label` and tooltip. Issue 14 deliberately does not add one: the working
design paired the dot with static text that disagreed with the cue beside it,
and a second copy of the cue vocabulary in the application is exactly the drift
that text was. If a visible label is wanted, it is a change to
`PersistenceIndicator`'s own presentation and belongs here.
