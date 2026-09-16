# 18 — Design how an author deletes a Space Thing from the Space

Status: ready-for-human

Surfaced by: Bugbot on `prototype/space-thing-edit-portal` (`App.tsx` ~1167).
Related: ADR 0074, ADR 0076, `space-cards/16`, `command-dock/27` entity menu,
`v1-release/03`, `DeleteThingConfirmation`.

**What to build:** Nothing yet. Grill and design the Delete-from-Space gesture
for a Space Thing. Do not restore the Markdown menu row as a silent 04 or
entity-menu fix.

## Why

Markdown and Alias already leave two ways: **Remove from Diagram** (Backspace /
Delete, no question) and **Delete from Space** (entity menu, confirms, then
`deleted-thing`). A Space Thing's `thingDeletion.execute` already branches to
`spaceThings.delete` and the confirmation copy already names the ADR 0074
cascade. The Space Thing entity menu does not offer that row.

That is current treatment, not a missed wire. `command-dock/27` recorded the
groups as Rename / Create Alias; Enter / Open in New Tab; the three copy
links; Remove from Diagram. `App.tsx` keeps that by filtering `leaving` to
`remove-from-diagram`. `space-authoring` still refuses `deleted-thing` on a
Space Thing (`space-thing-deletion-unsupported`) so the Markdown completion
cannot stand in.

Deleting a Space Thing can take the target Space and every Space below it that
nothing else references. Copying Markdown's dialog onto that command is a UX
decision, not an implementation leftover.

## Already true — do not rebuild

- `spaceThings.delete` is the coordinated Edit (`space-cards/16`).
- `DeleteThingConfirmation` has a `space` arm in `DELETION_DESCRIPTIONS`.
- Remove from Diagram on a Space Thing is offered and works.
- Delete from Space is withdrawn while any Thing is Open (`deleteThing`).
- Keyboard Backspace/Delete is Remove from Diagram, never Delete from Space.

## Grill at least

- Does a Space Thing offer Delete from Space at all, or is Remove from Diagram
  the only leaving command until a later release?
- If it does: same confirmation as Markdown, the existing cascade paragraph, or
  a different question (name the target Space, last-reference vs remaining
  references, Open vs Closed)?
- Where does the command sit — entity menu destructive group, Dock, Things
  list — given the cascade can destroy work that is not on this canvas?
- What happens while the Space Thing is Open (today Delete is withdrawn so
  Open state cannot outlive the Thing)?
- How does Enter / an already-open target Space interact with confirming
  deletion?

## Avoid

- Shipping the Markdown confirmation unchanged "because the copy exists".
- Restoring cascade e2e in `space-thing.spec.ts` as if the row were product.
- Completing `deleted-thing` for a Space Thing from this canvas.
- Treating this as leftover `space-thing-edit-portal/04` work.

## Acceptance

- Shared understanding confirmed before any menu or dialog code is written.
- If the product stays "Remove only", record that on this ticket and in the
  entity-menu comment in `App.tsx` so the next review does not re-raise it.
- If Delete from Space ships, a later implementation ticket owns the surface;
  this one does not.
