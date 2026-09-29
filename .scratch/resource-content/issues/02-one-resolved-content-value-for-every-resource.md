# 02: One resolved content value for every Resource (expand)

**What to build:** A single value says what any Resource's content is — Markdown with its source, an image with its URL, a Space view, or unresolved — and whether it is the Resource's own or reached through a Reference Resource. It is declared once where every package can see it, and `graph` resolves it totally and in one hop from a Resource (not an id), beside the existing resolution, which stays until 06. See `spec.md` for the type shapes. Nothing draws from it yet.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Markdown, Image and Space Resources resolve to their own content with `via: 'self'`; a Reference Resource resolves to its Target's content with `via: 'reference'`.
- [ ] A Reference Resource whose Target is missing, or is itself a Reference Resource, resolves to `unresolved` (a table test builds that Space by hand, since intake refuses it).
- [ ] A property test over Spaces intake accepts: the result is never `unresolved`, `via` is `'self'` exactly for non-Reference Resources, and a Reference Resource's result equals its Target's with `via` changed.
- [ ] The Space view carries only what an Open Space Resource shows (its Space, Map, Graph and framing), not the Resource.
- [ ] `graph`'s curated package surface lists the new function.
- [ ] `pnpm verify` passes.
