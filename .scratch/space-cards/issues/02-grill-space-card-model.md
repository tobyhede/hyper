# Grill the Space Card model

Status: resolved
Type: grilling

## Context

`.scratch/space-cards/issues/01-render-a-space-card-as-a-sub-flow.md` found it could not be scheduled: ADR 0001 decided a card may itself be a space, arbitrarily deep, but "Space Cards exist in `CONTEXT.md` and ADR 0001 and in no code: no kind, no reference field, no import path, no export path." It named the prior decision explicitly: "what a Space Card is as a domain value: its kind, what it references, and whether that reference names a Layout or a View of the target Space... a grilling ticket in its own effort." This is that ticket, prompted by a proposal to retire `WorkspaceSelection` (the multi-Space chooser) in favour of reaching every Space through a Space Card.

## Task

Walk the decision tree with the user (`/grilling`), covering at minimum:

- What does a Space Card reference — a bare Space id, or a Space plus a pinned Layout/View?
- Is the reference a shared, retargetable pointer (like Alias's Target) or ownership?
- Does creating a Space Card provision its target Space atomically, or defer provisioning to first open?
- What stops a Space containing itself? ADR 0009's single-hop rule is Alias-only and doesn't cover Space nesting.
- What happens to the target Space when its Space Card is deleted?
- Is the root Space's "directory of other Spaces" role system-enforced or pure convention?
- What happens to `WorkspaceSelection` and `importSpaces` (ADR 0030), given a Space is now only reachable through a Space Card?
- Does "workspace" survive as vocabulary distinct from Space?
- Which navigation mechanic — take-over-view or infinite-canvas zoom — and does "open in a new tab" belong in this decision?

## Acceptance

- Shared understanding confirmed before any schema is written.
- `CONTEXT.md` updated for the sharpened Space Card entry and the retired "workspace" synonym.
- An ADR recorded for the load-bearing, surprising, hard-to-reverse parts.

## Answer

Grilled 2026-08-20. Recorded in ADR 0058 (the load-bearing part) and sharpened in `CONTEXT.md` (the Space Card entry and Space's `_Avoid_` list).

- **Reference is a bare `{ kind: 'space', spaceId }`.** No pinned Layout/View — a Space Card always opens to whatever the target Space's own renderer choice is, so it can't become a second place selecting the same canvas choice ADR 0053 already gives one home.
- **Ownership, not a shared pointer.** Unlike Alias's Target, a Space Card's reference is never retargeted once minted. It is the only path to the Space it names.
- **Creation is atomic.** Creating a Space Card mints the Card and a new, empty target Space (ADR 0018's template) in the same Edit, via the same `newId` seam that already mints Card/Layout ids. A Space Card can never point at nothing.
- **Deletion cascades.** Deleting a Space Card deletes the Space it owns, and everything nested inside it, in the same Edit. Deliberately destructive, no soft-delete built. Rejected alternative: detach-and-orphan, which reopens the exact unreachable-Space state this decision closes off everywhere else.
- **Cycles are rejected at `loadSpace` intake** (ADR 0010) — a Space Card may not target an ancestor along the chain that reaches it. Depth stays arbitrary (ADR 0001); cycles do not.
- **The root Space is pure convention.** ADR 0018's existing one-card bootstrap needs no change, and plays this role by virtue of never being nested under anything. Nothing restricts what it may contain.
- **`WorkspaceSelection` is deleted outright, not redesigned**, along with the startup branch that renders it. `importSpaces` (ADR 0030) is refined to mint a linking Space Card in the root for each Space it imports, so nothing it creates becomes an orphan.
- **"Workspace" retires as vocabulary.** It was never a concept distinct from "the loaded Space" — ADR 0053's own prose already used it that way. "workspace Sidebar" becomes "Space Sidebar" going forward; existing accepted ADRs are not edited.
- **Navigation mechanic, new-tab/routing, and breadcrumb UI are explicitly out of scope**, parked as a separate follow-on. The only constraint carried forward is the bare-`spaceId` reference, chosen so neither a take-over-view nor an infinite-zoom mechanic is foreclosed.

Unblocks `.scratch/space-cards/issues/01-render-a-space-card-as-a-sub-flow.md`. Also narrows `.scratch/design-system-baseline/issues/04-bring-workspace-selection-and-feedback-into-the-system.md` (its chooser criterion is superseded) and its ownership line in `.scratch/design-system-baseline/issues/13-restack-surface-inventory-for-delivery.md`.
