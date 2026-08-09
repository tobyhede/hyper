# Interaction drafts stay local and Space replacement invalidates them

Status: accepted
Refines: 0035
Related: 0028, 0030, 0039, 0040, 0041

An unfinished authoring interaction owns an **Interaction draft** local to the
surface conducting it. A title field owns its changed text, a picker owns its
unconfirmed target, React Flow owns its connection or drag attempt, and an
armed destructive control owns its confirmation state. None of these values is
a partial Space or an Edit waiting to be persisted. Cancelling discards the
local draft and needs no compensating Edit.

A successful semantic authoring operation crosses the Space Authoring
interface exactly once. Space Authoring re-reads the current working Space and
the identities supplied by the interaction, derives and validates the complete
next Space, installs it optimistically and submits it through SpaceSession. At
that point the Edit is authoritative local work: Escape cannot cancel it, a
persistence failure does not roll it back, and operation-specific recovery does
not appear. Add Card and Add Graph therefore complete before their follow-up
title fields open; cancelling that rename keeps the new entity. Alias creation,
by contrast, remains a local picker draft until a target makes the Alias valid.

Expected completion outcomes are **completed**, **unchanged** and **refused**.
An unchanged operation produces no Edit and no error. A refused operation also
produces no Edit and returns an associated explanation to the initiating
surface, which keeps focus and its relevant draft. Programming errors and
broken internal invariants are still reported as failures; they are not
converted into user-facing refusals. This is a result vocabulary shared by
semantic operations, not a generic command union or a new command module.

## Persistence does not own interaction state

Pending persistence never locks Authoring. Later completed Edits replace the
local working snapshot and SpaceSession coalesces them as it does today. A
retryable failure retains the newest local Space and every still-valid local
draft; Retry commits the newest working snapshot, not the one that originally
failed. A conflict also retains local work and drafts. **Keep local** commits
the newest local snapshot against the current stored revision. A permanent
rejection retains local work and its global explanation; a later valid Edit may
attempt the newest complete snapshot again. None steals focus.

**Accept stored** is different: it replaces the entire working Space rather
than completing an Edit. Space Authoring first validates the stored snapshot.
If validation refuses it, nothing changes. If accepted, SpaceSession,
placement, renderer/navigation state and the replacement signal are installed
as one externally published transition. The replacement signal is a monotonic
`replacementEpoch` in the Space Authoring interface. Every interaction-local
owner discards its draft when that epoch changes; target-bound surfaces close,
selection and Traversal history clear, and App composition focuses the canvas
only after the replacement is complete.

Replacement invalidation also applies to completed authoring work that is
queued for re-entrant processing. Space Authoring may queue a completion when
an observer attempts another completion while an earlier Edit is being
installed and published. The queued value is no longer an Interaction draft,
but it may still contain identities, placement, or completed Card values read
from the Space that was current when it was queued.

Each queued completion records the current `replacementEpoch`. When the queue
is drained, Space Authoring discards any completion whose recorded epoch
differs from the current epoch. It must not derive that completion against the
replaced Space, even if some of its identities still happen to exist there.
Discarding such work produces no Edit and does not report an expected user
refusal. The accepted stored Space remains authoritative, and the next
completion must be derived from that Space. The replacement contract therefore
covers both unfinished Interaction drafts and completed work waiting for safe
re-entrant ordering.

The epoch is invalidation, not a registry. Space Authoring does not know which
field, picker, popover, drag or armed control is open, and those surfaces do not
register cancellation callbacks. Each owner compares or is keyed by the epoch
and applies its own normal cancellation. Retry, Keep local, persistence status
changes, ordinary renderer selection and completed Edits do not advance it.

## Why the seam is here

We rejected a Draft Space beside the validated Space. The new operations do not
need to hold an inconsistent aggregate: every incomplete value can remain with
the interaction that understands it, while every completed operation can
derive a valid whole snapshot before installation. A second Space-shaped value
would force every reader to choose between two authorities and would make
cancellation a domain rollback.

We also rejected a central interaction coordinator carrying a discriminated
union of every possible draft or a callback registry for clearing them. That
interface would grow whenever a shadcn surface or React Flow gesture changed,
turning App composition into a shallow pass-through and coupling unrelated
interactions. Local ownership keeps primitive behavior local; the one fact all
owners need—the Space they referenced was replaced—crosses one small interface.

The accepted cost is distributed reset handling, pinned by one shared contract
test and surface-specific focus tests. A surface that forgets to observe the
replacement epoch could retain a stale identity, so every new target-bound
interaction must include replacement invalidation in its acceptance cases.
