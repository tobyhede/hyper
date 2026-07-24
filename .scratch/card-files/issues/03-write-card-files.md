# 03 — Persist card files

Status: open
Type: task
Blocked by: 02

The writer half, deliberately separated so 01 and 02 are verifiable on reads.

`PUT /__space` writes one fixed path today, and the narrowness is the security
property: the client never sends a path, because an endpoint that takes one is an
arbitrary-file-write primitive for any page the human has open. That property is
not negotiable here — whatever the endpoint becomes, **every path stays derived
server-side**.

To decide when the ticket is picked up, not now:

- Whether the endpoint takes a whole space (space file plus card files, server
  writes what changed) or grows a second path for a single card. Bundle is
  simpler to reason about; per-card is less write amplification on a drag, which
  changes no card body at all.
- What a card file is *named*, given the filename is conventionally the card but
  is not its identity (ADR 0020). Derived from the title is the obvious answer
  and needs a collision rule.
- Where the local override lives now that a space is a directory rather than a
  file. `space.local.json` shadows one file; a card body has no equivalent, and
  "your unsaved work" versus "the authored base" may not survive being a
  directory. This is the part most likely to be harder than it looks.

## Acceptance

- Create a card, reload, it is still there — the round trip the whole editing arc
  has been missing.
- The written files load back through `loadSpace` unchanged.
- No client-supplied path reaches the filesystem; assert it.
- `pnpm verify` and `pnpm e2e` green.
