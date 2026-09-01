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

Every action asks the applicable guards before its own checks:

1. Is a Computed View selected for anything except `created-layout`? → `computed-view-read-only`, before placement readiness can obscure the read-only reason
2. Placement reported? → `placement-pending`; this is the first guard for `created-layout`
3. Does a selected authored Layout still exist? → `layout-not-found`

## Per-action checks

Guards above are omitted below. "On a View" names what the first guard does for
that action.

### Card edits

| Action | On a View | Its own checks, in order |
| --- | --- | --- |
| `edited-card` | `computed-view-read-only` | `card-not-found` → `card-kind-immutable` → `alias-target-immutable` → `space-card-target-immutable` → `card-title-required` → (identical to current ⇒ `unchanged`) → `alias-target-not-found` → `alias-target-must-own-content` → completed |
| `created-card` | `computed-view-read-only` | none → completed |
| `created-alias` | `computed-view-read-only` | `alias-target-not-found` → `alias-target-must-own-content` → completed |
| `opened-card` | `computed-view-read-only` | `card-not-in-layout` → (already Open ⇒ `unchanged`) → completed |
| `closed-card` | `computed-view-read-only` | `card-not-in-layout` → (already Closed ⇒ `unchanged`) → completed |
| `resized-card` | `computed-view-read-only` | `card-not-in-layout` → `card-not-expanded` → (same size ⇒ `unchanged`) → completed |
| `added-card-to-layout` | `computed-view-read-only` | `card-not-found` → `card-already-in-layout` → completed |
| `removed-card-from-layout` | `computed-view-read-only` | `card-not-in-layout` → completed |
| `deleted-card` | `computed-view-read-only` | `card-not-found` → `space-card-deletion-unsupported` → `card-has-aliases` → completed |

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
| `create-and-connect` | `computed-view-read-only` | `edge-card-outside-layout` → `layout-active-graph-required` → completed |
| `connected-cards` | `computed-view-read-only` | `edge-card-outside-layout` → `layout-active-graph-required` → `edge-already-exists` → completed |
| `reconnected-edge` | `computed-view-read-only` | `graph-not-owned` → `edge-not-found` → (dropped back to its own Card ⇒ `unchanged`) → `edge-card-outside-layout` → `edge-already-exists` → completed |
| `deleted-edge` | `computed-view-read-only` | `graph-not-owned` → `edge-not-found` → completed |

### Graph edits

| Action | On a View | Its own checks, in order |
| --- | --- | --- |
| `added-graph` | `computed-view-read-only` | none → completed |
| `renamed-graph` | `computed-view-read-only` | `graph-not-owned` → `graph-title-required` → (same title ⇒ `unchanged`) → completed |
| `recolored-graph` | `computed-view-read-only` | `graph-not-owned` → (same color ⇒ `unchanged`) → completed |
| `deleted-graph` | `computed-view-read-only` | `graph-not-owned` → `layout-must-keep-graph` → completed |

### Layout edits

| Action | On a View | Its own checks, in order |
| --- | --- | --- |
| `renamed-layout` | `computed-view-read-only` | `layout-not-found` → `layout-title-required` → (same title ⇒ `unchanged`) → completed |

`layout-not-found` here is not the universal gate 2 check: it is `renamed-layout`
naming a Layout other than the one the Edit resolved, which is an author's stale
gesture rather than a broken invariant.

### Layout creation

| Action | On a View | Its own checks, in order |
| --- | --- | --- |
| `created-layout` | converts | none → completed |

### Movement

| Action | On a View | Its own checks, in order |
| --- | --- | --- |
| `settled-card-movement` | `computed-view-read-only` | none → completed |

## The 24 codes

4 contextual (`placement-pending`, `layout-not-found`, `layout-required`, `computed-view-read-only`) plus
the 20 action-specific codes tabulated above — none is produced anywhere else.
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
