# Authoring refusal cascade

Traced from `deriveCompletedEdit` in `packages/app/src/space-authoring.ts`. Read
this before adding a completion action, adding or reordering a check inside
one, or adding a refusal code — it is the one place the full cascade is drawn
out end to end instead of scattered across a 1300-line function.

Every `complete(completion)` call answers exactly one **completion outcome** —
`completed`, `unchanged` or `refused` (`CONTEXT.md`, ADR 0042/0057;
architecture and rationale live in `docs/agents/editing-and-persistence.md`'s
"Space Authoring's completed-edit lifecycle" section, not here). It gets there
by running an ordered cascade: three guards common to every action, then that
action's own ordered checks. First failure wins; nothing past it runs.
`edgeEligibility`/`connectRefusal` ask the identical checks before commit,
while a drag or connect gesture is still live in the author's hand, so the
preview and the committed Edit can never disagree.

This table is a cache of the code's control flow, not a second source of
truth for it — update it in the same commit as any change to
`deriveCompletedEdit`'s cascade, or delete the stale row rather than leave it
disagreeing with the function.

## Universal guards

Every action asks these three, in order, before its own checks:

1. Placement reported? → `placement-pending`
2. Selected Layout still exists? → `layout-not-found`
3. On a View, does this action need a Layout already authored? → `layout-required` — only the 7 actions marked **layout-required** below; every other action converts the View into a fresh Layout instead (ADR 0025) and keeps going

## Per-action checks

Guards above are omitted below since they never vary by action. "On a View"
names what gate 3 does for that action.

### Card edits

| Action | On a View | Its own checks, in order |
| --- | --- | --- |
| `edited-card` | converts | `card-not-found` → `card-kind-immutable` → `alias-target-immutable` → `card-title-required` → (identical to current ⇒ `unchanged`) → `alias-target-not-found` → `alias-target-must-own-content` → completed |
| `created-card` | converts | none → completed |
| `created-alias` | converts | `alias-target-not-found` → `alias-target-must-own-content` → completed |
| `opened-card` | converts | `card-not-in-layout` → (already Open ⇒ `unchanged`) → completed |
| `closed-card` | **layout-required** | `card-not-in-layout` → (already Closed ⇒ `unchanged`) → completed |
| `resized-card` | **layout-required** | `card-not-in-layout` → `card-not-expanded` → (same size ⇒ `unchanged`) → completed |
| `added-card-to-layout` | **layout-required** | `card-not-found` → `card-already-in-layout` → completed |
| `removed-card-from-layout` | **layout-required** | `card-not-in-layout` → completed |
| `deleted-card` | converts | `card-not-found` → `card-has-aliases` → completed |

`card-not-expanded` is the code `resized-card` raises for a Card that is
**Closed**. The prose in this file speaks `CONTEXT.md`'s Open/Closed vocabulary;
every code string is quoted exactly as `AuthoringRefusal['code']` declares it,
retired wording included. A refusal code is a stable identity across the seam
(ADR 0057), so renaming this one is a change to the domain surface rather than a
wording fix — do not correct it here, and do not let the mismatch tempt a rename
that has not been decided.

### Connections

| Action | On a View | Its own checks, in order |
| --- | --- | --- |
| `create-and-connect` | converts | `edge-card-outside-layout` → `layout-active-graph-required` → completed |
| `connected-cards` | converts | `edge-card-outside-layout` → `layout-active-graph-required` → `edge-already-exists` → completed |
| `reconnected-edge` | **layout-required** | `graph-not-owned` → `edge-not-found` → (dropped back to its own Card ⇒ `unchanged`) → `edge-card-outside-layout` → `edge-already-exists` → completed |
| `deleted-edge` | **layout-required** | `graph-not-owned` → `edge-not-found` → completed |

### Graph edits

| Action | On a View | Its own checks, in order |
| --- | --- | --- |
| `added-graph` | is the conversion | none → completed |
| `renamed-graph` | **layout-required** | `graph-not-owned` → `graph-title-required` → (same title ⇒ `unchanged`) → completed |
| `recolored-graph` | **layout-required** | `graph-not-owned` → (same color ⇒ `unchanged`) → completed |
| `deleted-graph` | **layout-required** | `graph-not-owned` → `layout-must-keep-graph` → completed |

### Movement

| Action | On a View | Its own checks, in order |
| --- | --- | --- |
| `settled-card-movement` | converts | none → completed |

## The 21 codes

3 universal (`placement-pending`, `layout-not-found`, `layout-required`) plus
the 18 action-specific codes tabulated above — none is produced anywhere else.
Count the codes, not the cells: several serve more than one action —
`card-not-found`, `card-not-in-layout`, `graph-not-owned`,
`edge-card-outside-layout` and the two `alias-target-*` each appear in more than
one row.
`describeAuthoringRefusal` in `authoring-refusal.ts` is the one place every
code gets its copy, and the exhaustive placement records beside it are the one
place each surface's field mapping lives: the domain names the code, the
application owns the sentence. Five surfaces map it today — Markdown Card
editing (`title`), Alias editing and Alias creation (`title` / `target`),
Edge endpoint editing (the attempted `from` or `to`, never both) and Edge
deletion (form only). Every record is
`Record<AuthoringRefusalCode, …>`, so a new code fails to compile until each
surface has said where it goes.
