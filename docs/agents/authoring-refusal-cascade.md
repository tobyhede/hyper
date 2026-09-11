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

## Universal guards

Every action asks the applicable guards before its own checks:

1. Placement reported? → `placement-pending`
2. Does the selected Diagram still exist? → `diagram-not-found`

Three actions are derived **above** the placement gate and so ask neither:
`created-diagram`, `deleted-diagram` and `renamed-space` write keys of
`document` rather than anything inside a Diagram, read the working snapshot
direct, and answer their own placement. The last two still resolve a Diagram —
for the placement the completion carries, not for permission — so
`diagram-not-found` appears in their rows as an ordinary check, and in
`renamed-space` it is asked *after* the title checks: a blank name is a blank
name whether or not the canvas has moved on.

## Per-action checks

Guards above are omitted below.

### Thing edits

| Action | Its own checks, in order |
| --- | --- |
| `edited-thing` | `thing-not-found` → `thing-kind-immutable` → `alias-target-immutable` → `space-thing-target-immutable` → `thing-title-required` → (identical to current ⇒ `unchanged`) → `alias-target-not-found` → `alias-target-must-own-content` → completed |
| `created-thing` | none → completed |
| `created-alias` | `alias-target-not-found` → `alias-target-must-own-content` → completed |
| `opened-thing` | `thing-not-in-diagram` → (already Open ⇒ `unchanged`) → completed |
| `closed-thing` | `thing-not-in-diagram` → (already Closed ⇒ `unchanged`) → completed |
| `resized-thing` | `thing-not-in-diagram` → `thing-not-expanded` → (same size ⇒ `unchanged`) → completed |
| `added-thing-to-diagram` | `thing-not-found` → `thing-already-in-diagram` → completed |
| `removed-thing-from-diagram` | `thing-not-in-diagram` → completed |
| `deleted-thing` | `thing-not-found` → `space-thing-deletion-unsupported` → `thing-has-aliases` → completed |

`thing-not-expanded` is the code `resized-thing` raises for a Thing that is
**Closed**. The prose in this file speaks `CONTEXT.md`'s Open/Closed vocabulary;
every code string is quoted exactly as `AuthoringRefusal['code']` declares it,
retired wording included. A refusal code is a stable identity across the seam
(ADR 0057), so renaming this one is a change to the domain surface rather than a
wording fix — do not correct it here, and do not let the mismatch tempt a rename
that has not been decided.

### Connections

| Action | Its own checks, in order |
| --- | --- |
| `create-and-connect` | `edge-thing-outside-diagram` → `diagram-active-graph-required` → completed |
| `connected-things` | `edge-thing-outside-diagram` → `diagram-active-graph-required` → `edge-already-exists` → completed |
| `reconnected-edge` | `graph-not-owned` → `edge-not-found` → (dropped back to its own Thing ⇒ `unchanged`) → `edge-thing-outside-diagram` → `edge-already-exists` → completed |
| `deleted-edge` | `graph-not-owned` → `edge-not-found` → completed |

### Graph edits

| Action | Its own checks, in order |
| --- | --- |
| `added-graph` | none → completed |
| `renamed-graph` | `graph-not-owned` → `graph-title-required` → (same title ⇒ `unchanged`) → completed |
| `recolored-graph` | `graph-not-owned` → (same color ⇒ `unchanged`) → completed |
| `deleted-graph` | `graph-not-owned` → `diagram-must-keep-graph` → completed |

### Diagram edits

| Action | Its own checks, in order |
| --- | --- |
| `renamed-diagram` | `diagram-not-found` → `diagram-title-required` → (same title ⇒ `unchanged`) → completed |
| `deleted-diagram` | `diagram-not-found` → `space-must-keep-diagram` → completed |

`diagram-not-found` here is not the universal gate 2 check: it is the action
naming a Diagram other than the one the Edit resolved, which is an author's stale
gesture rather than a broken invariant.

`deleted-diagram` refuses the last Diagram (ADR 0079) and otherwise completes on a
survivor: the selected Diagram if it survived, else the first, which is also what
`defaultDiagram` becomes when the deleted Diagram was it.

### Diagram creation

| Action | Its own checks, in order |
| --- | --- |
| `created-diagram` | none → completed |

### Space edits

| Action | Its own checks, in order |
| --- | --- |
| `renamed-space` | `space-title-required` → (same title ⇒ `unchanged`) → `diagram-not-found` → completed |

`renamed-space` writes `document.title` and nothing else, and it raises no
refusal of its own beyond the blank title: `diagram-not-found` is the code the
chosen shape already had, and a Diagram condition invented for it would make an
Edit that holds no Diagram say it needed one.

### Movement

| Action | Its own checks, in order |
| --- | --- |
| `settled-thing-movement` | none → completed |

## The 25 codes

2 contextual (`placement-pending`, `diagram-not-found`) plus 23 action-specific —
none is produced anywhere else. 22 of those 23 are tabulated above;
`diagram-required` is declared and presented but currently raised nowhere, so it
appears in no row.
Count the codes, not the cells: several serve more than one action —
`thing-not-found`, `thing-not-in-diagram`, `graph-not-owned`,
`edge-thing-outside-diagram` and the two `alias-target-*` each appear in more than
one row.
`describeAuthoringRefusal` in `authoring-refusal.ts` is the one place every
code gets its copy, and the exhaustive placement records beside it are the one
place each surface's field mapping lives: the domain names the code, the
application owns the sentence. Five surfaces map it today — Markdown Thing
editing (`title`), Alias editing and Alias creation (`title` / `target`),
Edge endpoint editing (the attempted `from` or `to`, never both) and Edge
deletion (form only). Every record is
`Record<AuthoringRefusalCode, …>`, so a new code fails to compile until each
surface has said where it goes.
