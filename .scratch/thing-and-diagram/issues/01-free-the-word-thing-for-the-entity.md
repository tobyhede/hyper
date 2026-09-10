# 01 — Free the word "thing" for the entity

Status: ready-for-agent
Blocked by: none

**What to build:** Substitute the generic prose word *thing* for *entity* across
the authored source and current-state documents, and replace the synthetic
`Thing` placeholder in `test/unit/ui-catalog.test.ts`, so that when 02 lands the
new domain noun the word does not already mean something else on the line beside
it.

**Why:** ADR 0085 accepted Thing over Object on the ground that Thing collides in
prose rather than in identifiers, and it named this substitution as part of
change two. The collision is real and it is the whole cost of the name: today
`CONTEXT.md`'s supertype sentence would read "a referenceable thing — a Space,
Thing, Graph or Diagram." The repository already has the correct generic word and
uses it in a live `Entity*` component family. Doing this first is what keeps 02's
diff readable: a sweep that introduces `Thing` into a file still using *thing*
generically produces a paragraph no reviewer can check by eye.

- [ ] Every bare `thing`/`things` in the authored trees that means *entity* says
      entity, in the number and case the sentence needs.
- [ ] Bare uses that are ordinary English and do not mean the supertype — "the
      thing that arranges Things", "one thing at a time" — are read and left, and
      the ones that are load-bearing enough to reread later are listed in the
      `## Answer`.
- [ ] `test/unit/ui-catalog.test.ts` uses a placeholder that is not the domain
      noun for its arbitrary synthetic export, in all of its occurrences.
- [ ] `CONTEXT.md` was already converted upstream (`2a106667`); confirm rather
      than redo, and cover what it missed.
- [ ] After this lands, a case-sensitive scan for word-boundary `Thing` over the
      sweepable trees finds nothing but `AGENTS.md`'s and `CONTEXT.md`'s
      deliberate naming of the ADR's decision.

## The state this starts from

Measured on this branch at `501b0ae3`, over the 662 tracked regular files the
change-one codemod's exclusions leave (`docs/adr/`, `docs/superpowers/`,
`.scratch/`, `pnpm-lock.yaml`, `skills-lock.json`, `.agents/skills/`):

- **534 bare `thing`/`things` across 160 files.** ADR 0085 estimated 336 and the
  inventory measured 528 a day ago; it grows with every doc comment written, so
  re-measure rather than trusting any of the three numbers.
- **Word-boundary capital `Thing` appears in exactly three files**: `AGENTS.md`
  and `CONTEXT.md`, both naming the ADR's decision deliberately, and
  `test/unit/ui-catalog.test.ts`, which uses it 34 times as a stand-in export
  name in synthetic catalogue fixtures. Only the third is a false positive that
  the new vocabulary would make permanent.

## Hazards

- **This is not a mechanical substitution and must not be run as one.** *entity*
  is right where the sentence means the supertype and wrong everywhere else; a
  blind `s/thing/entity/g` produces "the entity that arranges Cards" for a
  sentence about a LayoutStrategy. Read each hit. This is the one part of change
  two the codemod does not own.
- The plural and the article both move: "things" → "entities", "a thing" → "an
  entity".
- `docs/agents/*.md`, `README.md` and `AGENTS.md` are current-state documents and
  are in scope. `docs/adr/` and `.scratch/` are not.
