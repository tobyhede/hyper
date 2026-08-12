# Reconcile the stack with mainline placement ownership

Status: ready-for-agent
Blocked by: 05

## Why this exists

It was not planned. PR #55, "Let Space Authoring own on-screen placement", merged
to `main` while tickets 02–05 were being built, and it rewrites the same module
ticket 03 rewrote. This ticket reconciles the two. It exists as its own step
because it is a design reconciliation, not the mechanical integration `06` was
scoped for, and `06` should not have to discover it.

## What the two sides did

**Mainline (#55)** reshaped how a completion carries its own inputs:

- Every `AuthoringCompletion` variant now carries the placement it was rendered
  from — `rendered: Placement` — instead of the editor installing placement
  ahead of reporting.
- `edited-card` carries its `document: CardDocument` on the completion.
- `ReportedCompletion` therefore loses its `cardDocuments` map.
- `installPlacement`/`installCardDocument` become
  `reportRendered`/`replacePlacement`, and `reportRendered` merges against a
  base that is `null` unless a Layout is selected.
- `initialPlacement` is gone from the dependencies.

**This stack (02, 03)** changed what a completion *means*:

- A Graph is a nested owned value of its Layout, so an Edit writes into a Graph
  that Layout owns rather than appending to a Space-level list.
- `createSpaceAuthoring` takes `currentSpace`, because which Layout an Edit
  writes and what it owns is the View's answer (ADR 0045).
- Conversion asks the View for the new Layout's content and mints a fresh empty
  Graph.
- `canConnect` and `canCreateConnectedCard` became conditional on a selected
  Layout, and `canConnect` gained a membership check.

The two are largely orthogonal in intent. They are not orthogonal in text.

## Why a plain merge is not enough

Git merges `space-authoring.ts` without a conflict and the result is wrong: it
takes mainline's `AuthoringCompletion` wholesale while keeping this stack's
dependency block, so `initialPlacement` survives beside the `replacePlacement`
that replaced it. Each hunk is individually reasonable; the whole is a shape
neither side designed.

`space-authoring.test.ts` conflicts in ten hunks, and those are the real work —
the tests are where the two APIs actually meet, and resolving them is deciding
which interface each behaviour is expressed through.

**Do the merge deliberately rather than resolving hunk by hunk.** Read both
sides first, decide the combined shape, then make the file say it.

## The combined shape

Mainline's direction wins on *how a completion is reported*: the completion
carries `rendered` and `document`, there is no `installCardDocument`, and
`initialPlacement` is gone. That is a newer decision about this module made
deliberately on `main`, and nothing in this stack contradicts it.

This stack wins on *what a completion means*: Layout-owned Graphs, the
`currentSpace` dependency, the View conversion boundary, and the two connection
predicates including the membership check.

Where they touch, both hold: a completion carries its own rendered placement
**and** the Edit it derives writes into a Graph the Layout owns.

## What must still be true afterwards

None of these is negotiable, and each is pinned by a test that must survive:

- The completion sequence is total: pure derivation before installation,
  `session.submit` first in the install window, the `installing` depth gate, and
  the `replacementEpoch` drain gate.
- The single `continueInRenderer(selection, activeGraphId)` call stays. Do not
  restore a separate `activateGraph` from Edit completion — the AGENTS.md bullet
  now records why, including the negative.
- Conversion produces a Layout owning exactly one fresh empty Graph, and an Edge
  drawn in the same gesture lands in it.
- A Graph with no Edges cannot be presented, and the control is disabled rather
  than dead.
- `canCreateConnectedCard` keeps the signature `connection-gesture.ts` consumes.

## Acceptance criteria

- [ ] `origin/main` is merged into the stack, with the combined shape above
      rather than a hunk-by-hunk resolution.
- [ ] `initialPlacement` is gone; placement arrives through `replacePlacement`
      and `reportRendered`.
- [ ] Every `AuthoringCompletion` carries its own `rendered`, and `edited-card`
      its `document`.
- [ ] The `currentSpace` dependency and the View conversion boundary survive.
- [ ] Every guarantee listed above still has a test, and the fault-injection
      coverage is no weaker than either side had.
- [ ] `pnpm verify` green.
- [ ] `pnpm e2e` green.
- [ ] PostgreSQL integration green, and the database stopped afterwards.
