# 09 — Graph-level end markers

Status: needs-info

**What to decide:** Whether a Graph chooses the end marker its Edges draw. Deferred out of the Edge toolbar effort; nothing in it depends on this.

**Why:** Markers, if wanted, are per Graph rather than per Edge (`spec.md`: per-Edge style is out). Today every Edge draws React Flow's `ArrowClosed` in its Graph's colour (`packages/react-flow-adapter/src/projection.ts`), and that stays the default.

Open:
- The set: closed arrow, open arrow, none, dot?
- Where the choice is made — likely the Dock's Graph cluster.
- A Graph field is a schema change and wants an ADR, as the Edge Title does.
- An Edge is directed and traversal follows `from → to`; if "none" is allowed, how does the Graph still show direction?
