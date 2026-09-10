# 09 — Rename a Space as a real Edit

Status: needs-triage
Tags: release/v1
Blocked by: nothing. `07` is what made the gap visible on a surface.

**What to decide and build:** Whether a Space can be renamed from inside it, and
if so what Edit does it.

`07` found this and could not take it. `space-authoring.ts`'s completion union
has `renamed-layout` and `renamed-graph` and **nothing for a Space**;
`spaceEntityActions`' `space` arm offers Copy link and no Rename, which is why
the retired Sidebar drew `space-title` as an `h1`. The Command Dock draws the
Space name as a **label** rather than as a disabled button for that reason and
says so where it is drawn: `DockSpace.onRename` is `null`, and the comment beside
it states that a name with no Edit behind it is not a command to grey out — a
greyed-out name advertises a command nobody can ever run.

The prototype offered an inline Space rename because a prototype over a stored
snapshot could write `document.title` directly. That is exactly what this ticket
must not copy.

**Why it is a domain change rather than a surface one.** The Space's title is the
stored document's, and a Space Card names the Space it points at (ADR 0074). So
the questions are:

- Does renaming a Space rewrite `document.title` on that Space's own session, and
  what happens to every Space Card in every other Space that draws the name?
- Is the Space Card's drawn name a projection of the target's title (in which case
  the rename propagates and the Card's own Title is something else), or the Card's
  own value (in which case they can disagree and the product has to say which is
  authoritative)?
- What refuses it? A blank title refuses the way a Layout's does; is there
  anything else — the meta Space, a Space with rejected work?

## Acceptance

- [ ] The decision above is recorded, in `CONTEXT.md` or an ADR, whichever the
      Space-Card-title question turns out to need.
- [ ] If it is built: a `renamed-space` completion, its refusal codes, and its
      round trip through the stored document.
- [ ] `DockSpace.onRename` stops being `null` at its one call site in `App.tsx`,
      and `IdentityName` draws the Space name as a button — the component already
      takes both arms, so no surface change is owed beyond passing the callback.
- [ ] A parity claim, with both a Ladle and an application proof, exactly as the
      Layout and Graph renames have.

## Comments

**Raised by `07`'s "Found while building it".** It was written there as "it wants
its own ticket" and lived only in that ticket's prose, which is what a status scan
misses (`docs/agents/issue-tracker.md`). This is that ticket.
