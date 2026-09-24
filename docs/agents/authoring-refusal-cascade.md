# Authoring refusal cascade

Traced from `deriveCompletedEdit` in `packages/app/src/space-authoring.ts`. Read
this before adding a completion action, adding or reordering a check inside
one, or adding a refusal code — it is the one place the full cascade is drawn
out end to end instead of scattered across a 1300-line function.

Scoped to completions, and that scope is the point. `StoredSpaceRefusal`
(`acceptStoredSpace`) is the other refusal family in the tree and is
deliberately absent below: it refuses an operation on the session, reaches no
completion outcome, and no surface presents both. Adding a code there is not a
change to this table.

Every `complete(completion)` call answers exactly one **completion outcome** —
`completed`, `unchanged` or `refused` (`CONTEXT.md`, ADR 0042/0057;
architecture and rationale live in `docs/agents/editing-and-persistence.md`'s
"Space Authoring's completed-edit lifecycle" section, not here). It gets there
by running an ordered cascade: two guards common to every action, then that
action's own ordered checks. First failure wins; nothing past it runs.
`edgeEligibility`/`connectRefusal` ask the identical checks before commit,
while a drag or connect gesture is still live in the author's hand, so the
preview and the committed Edit can never disagree.

This table is a cache of the code's control flow, not a second source of
truth for it — update it in the same commit as any change to
`deriveCompletedEdit`'s cascade, or delete the stale row rather than leave it
disagreeing with the function.

## Universal guard

Every action but the three below asks this guard before its own checks:

1. Does the selected Map still exist? → `map-not-found`

Three actions are derived **above** it and so ask nothing universal:
`created-map`, `deleted-map` and `renamed-space` write keys of
`document` rather than anything inside a Map, read the working snapshot
direct, and answer their own placement. The last two still resolve a Map —
for the placement the completion carries, not for permission — so
`map-not-found` appears in their rows as an ordinary check, and in
`renamed-space` it is asked *after* the title checks: a blank name is a blank
name whether or not the canvas has moved on.

## Per-action checks

Guards above are omitted below.

### Resource edits

| Action | Its own checks, in order |
| --- | --- |
| `edited-resource` | `resource-not-found` → `resource-kind-immutable` → `reference-target-immutable` → `space-resource-target-immutable` → `resource-title-required` → (identical to current ⇒ `unchanged`) → `reference-target-not-found` → `reference-target-must-own-content` → completed |
| `created-resource` | none → completed |
| `created-reference` | `reference-target-not-found` → `reference-target-must-own-content` → completed |
| `opened-resource` | `resource-not-in-map` → (already Open ⇒ `unchanged`) → completed |
| `closed-resource` | `resource-not-in-map` → (already Closed ⇒ `unchanged`) → completed |
| `resized-resource` | `resource-not-in-map` → `resource-not-expanded` → (same size ⇒ `unchanged`) → completed |
| `added-resource-to-map` | `resource-not-found` → `resource-already-in-map` → completed |
| `removed-resource-from-map` | `resource-not-in-map` → completed |
| `deleted-resource` | `resource-not-found` → `space-resource-deletion-unsupported` → `resource-has-references` → completed |

`resource-not-expanded` is the code `resized-resource` raises for a Resource that is
**Closed**. The prose in this file speaks `CONTEXT.md`'s Open/Closed vocabulary;
every code string is quoted exactly as `AuthoringRefusal['code']` declares it,
retired wording included. A refusal code is a stable identity across the seam
(ADR 0057), so renaming this one is a change to the domain surface rather than a
wording fix — do not correct it here, and do not let the mismatch tempt a rename
that has not been decided.

### Connections

| Action | Its own checks, in order |
| --- | --- |
| `create-and-connect` | `edge-resource-outside-map` → `map-active-graph-required` → completed |
| `connected-resources` | `graph-not-owned` → `edge-resource-outside-map` → `map-active-graph-required` → `edge-already-exists` → completed |
| `reconnected-edge` | `graph-not-owned` → `edge-not-found` → (dropped back to its own Resource ⇒ `unchanged`) → `edge-resource-outside-map` → `edge-already-exists` → completed |
| `deleted-edge` | `graph-not-owned` → `edge-not-found` → completed |
| `titled-edge` | `graph-not-owned` → `edge-not-found` → `edge-title-one-line` → (trimmed draft is the stored Title, or empty on an untitled Edge ⇒ `unchanged`) → completed |
| `hid-edge-title` | `graph-not-owned` → `edge-not-found` → `edge-title-required` → (already hidden ⇒ `unchanged`) → completed |
| `showed-edge-title` | `graph-not-owned` → `edge-not-found` → (already shown, or no Title ⇒ `unchanged`) → completed |

The three Edge Title Edits find the Edge by its endpoints and read only the
stored Edge, never the `edge` the completion carries (ADR 0104).
`edge-title-one-line` is asked of the raw draft, before the trim, so a line
break at either end is refused rather than trimmed away. An empty draft clears
the Title and `titleHidden` with it.

### Graph edits

| Action | Its own checks, in order |
| --- | --- |
| `added-graph` | none → completed |
| `renamed-graph` | `graph-not-owned` → `graph-title-required` → (same title ⇒ `unchanged`) → completed |
| `recolored-graph` | `graph-not-owned` → (same color ⇒ `unchanged`) → completed |
| `deleted-graph` | `graph-not-owned` → `map-must-keep-graph` → completed |

### Map edits

| Action | Its own checks, in order |
| --- | --- |
| `renamed-map` | `map-not-found` → `map-title-required` → (same title ⇒ `unchanged`) → completed |
| `deleted-map` | `map-not-found` → `space-must-keep-map` → completed |

`map-not-found` here is not the universal gate 2 check: it is the action
naming a Map other than the one the Edit resolved, which is an author's stale
gesture rather than a broken invariant.

`deleted-map` refuses the last Map (ADR 0079) and otherwise completes on a
survivor: the selected Map if it survived, else the first, which is also what
`defaultMap` becomes when the deleted Map was it.

### Map creation

| Action | Its own checks, in order |
| --- | --- |
| `created-map` | none → completed |

### Space edits

| Action | Its own checks, in order |
| --- | --- |
| `renamed-space` | `space-title-required` → (same title ⇒ `unchanged`) → `map-not-found` → completed |

`renamed-space` writes `document.title` and nothing else, and it raises no
refusal of its own beyond the blank title: `map-not-found` is the code the
chosen shape already had, and a Map condition invented for it would make an
Edit that holds no Map say it needed one.

### Movement

| Action | Its own checks, in order |
| --- | --- |
| `settled-resource-movement` | none → completed |

## The 26 codes

1 contextual (`map-not-found`) plus 25 action-specific —
none is produced anywhere else. 24 of those 25 are tabulated above;
`map-required` is declared and presented but currently raised nowhere, so it
appears in no row.
Count the codes, not the cells: several serve more than one action —
`resource-not-found`, `resource-not-in-map`, `graph-not-owned`, `edge-not-found`,
`edge-resource-outside-map` and the two `reference-target-*` each appear in more than
one row. `edge-title-one-line` is spelt from `@project/core`'s
`EDGE_TITLE_ONE_LINE`, as `resource-title-required` is from
`RESOURCE_TITLE_REQUIRED`: the Edge schema raises the same code.
`describeAuthoringRefusal` in `authoring-refusal.ts` is the one place every
code gets its copy, and the exhaustive placement records beside it are the one
place each surface's field mapping lives: the domain names the code, the
application owns the sentence. Five surfaces map it today — Markdown Resource
editing (`title`), Reference Resource editing and Reference Resource creation (`title` / `target`),
Edge endpoint editing (the attempted `from` or `to`, never both) and Edge
deletion (form only). Every record is
`Record<AuthoringRefusalCode, …>`, so a new code fails to compile until each
surface has said where it goes.
