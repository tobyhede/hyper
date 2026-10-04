# 01 — Auto-arrange a Map

**Status:** needs-triage

**What to build:** an author-invoked Auto-arrange that rewrites the selected Map's positions with an automatic layout strategy in one destructive Edit.

The accepted design is R6 and R7 in `docs/agents/maps-and-graphs.md` (ADR 0086): it runs only when the author asks, over an existing Map; it never runs at render, creates no Map and is never a selectable canvas context; and an automatic strategy is never seeded or constrained to honour a drop point. It lives in `graph`, which means re-siting the render-time `elkjs` ban in `eslint.config.js` rather than obeying it.

Open questions to settle before building:

- Does the Edit record which strategy produced the positions?
- Undo is not built. Does Auto-arrange ask for confirmation before rewriting a whole Map while undo does not exist?

Remove the Auto-arrange entry from the contract's "Accepted, not built" section in the change that verifies this.
