# 04 — Bring Space startup and operational feedback into the system

**What to build:** Present operational feedback through shared design-system surfaces, including busy, failure and persistence-refusal states.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** ready-for-agent

- [ ] ~~A Space choice is a clear reusable item/card treatment, including a usable loading state and an intentional empty state.~~ Superseded — see 2026-08-20 comment.
- [ ] Startup and placement failures use a common accessible alert treatment without losing their diagnostic detail.
- [ ] Ladle renders the actual feedback states rather than representative markup.

## Audit note

The current chooser story documents the production gaps rather than closing
them: rows remain bare buttons, the empty state is a heading over a void, and
the busy state has no visible progress. Treat that story as evidence of the
work still required, not acceptance of the surface.

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
