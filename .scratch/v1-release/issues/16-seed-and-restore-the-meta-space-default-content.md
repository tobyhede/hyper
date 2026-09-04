# 16 — Seed and restore the Meta Space Default Content

**What to build:** Give a newly initialized repository concise, deterministic
Default Content on the Meta Space's top-level Layout, and let an author restore
that exact initial aggregate through an explicit destructive CLI reset. The
content is ordinary authored state after creation: authors may edit or delete
it, and later loads never repair or reseed it.

**Blocked by:** 01 — Establish the Meta Space lifecycle; `space-cards/01` — Open
and edit a Space Card in place.

**Status:** ready-for-agent
Tags: release/v1

- [ ] First initialization creates the permanent Meta Space with one top-level
      Layout containing deterministic Default Content rather than the generic
      one-Card new-Space placeholder.
- [ ] The Meta Space contains concise explicit examples of a Closed Markdown
      Card, an Open Markdown Card showing rendered content, an Open Space Card
      showing its selected Layout and Graph, and an Alias targeting a Markdown
      Card.
- [ ] The Space Card targets one ordinary example Space containing three Cards
      and a small Graph; the complete initialized aggregate satisfies normal
      Meta reachability, reference and lifetime rules.
- [ ] Titles and Markdown are deliberately brief examples such as “Welcome,”
      “Show some content” and “This is a Space”; this ticket does not introduce
      a separate tutorial content-design effort.
- [ ] Default Content uses tracked deterministic identities, placement,
      Open/Closed state, Open Size, selections and Graph data so reset,
      documentation and executable evidence observe the same aggregate.
- [ ] Loading any initialized repository preserves its current authored state,
      including an empty or heavily edited Meta Space, without adding, repairing
      or replacing Default Content.
- [ ] An explicit CLI hard-reset operation warns that it will destroy the
      complete repository, requires confirmation unless forced for automation,
      and atomically replaces it with the canonical Meta Space and Default
      Content.
- [ ] The reset is replacement, not merge: it preserves no pre-reset Space and
      offers no compatibility path for pre-V1 state.
- [ ] There is no merge-style seed command or browser reset control; complete
      aggregate import replacement remains ticket 08's separate operation.
- [ ] The canonical generator is shared by first initialization and explicit
      reset so they cannot drift into different initial aggregates.
- [ ] Unit, PostgreSQL integration and CLI evidence prove initialization,
      no-reseed reload, confirmed/forced reset, cancellation and atomic failure;
      browser evidence proves the expected Default Content opens and behaves as
      ordinary editable Cards.
