# 01 — Free the word "thing" for the entity

Status: resolved
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

## Answer

Resolved. The substitution is **26 sentences across 22 files**, not 534, and the
gap between those numbers is the finding.

Reading all 325 remaining hits one at a time — the issue says this part cannot be
mechanical and that turned out to be the whole of it — the bare word is
overwhelmingly ordinary English that no rename touches: "the only thing", "the
one thing", "two things", "the same thing". Rewriting those to *entity* would
have been wrong, because they are not entities. ADR 0085's sentence about
"thing" ceasing to be available as the casual generic is a cost future writers
pay in what they write next; it is not a mandate to convert English already in
the tree, and nothing in the guard reports a bare lowercase word anyway.

What was actually converted falls in three groups.

**The supertype sense — *entity*.** `authoring-availability.ts` ("whether a
proposed thing may exist"), `placement.ts` ("the authored thing a Space holds"),
`titles.ts` ("number one kind of thing differently"), three doc comments in
`edge-authoring.ts` about the thing a draft is about, the continuation rule in
`continuation.ts` and `docs/agents/ui.md` ("an Edit continues at the thing it
produced"), `story-spaces.test.ts` ("four kinds of thing"), `CanvasCard.tsx`'s
selector choice, and eight sentences in `CommandDock.tsx` and its stylesheet
about the named thing a cluster is showing. `CONTEXT.md` already said *entity* in
every one of these places, so the code was the half that disagreed.

**The domain entity in the old vocabulary — *Card*.** `README.md`'s intake
sentence ("a Diagram positions and shows only things the Space has"),
`card-icons.stories.tsx` twice ("the kind of the thing on the canvas"). These
were lowercase domain uses that 02's codemod could not see; they now read `Cards`
and sweep with everything else.

**Sentences that only became ambiguous — reworded rather than substituted.**
"the thing that arranges Cards is a LayoutStrategy" and "never the thing
'layout' means" take *what* (`AGENTS.md`, `eslint.config.js`,
`packages/core/src/types.ts`), because *entity* is exactly what a LayoutStrategy
is not. `App.tsx`'s "content is not a thing a Diagram owns" and `lookup.ts`'s "a
thing a Space *has*" take *something*. Three Lucide glyph notes in
`card-icons.stories.tsx` describe shapes, and one of them opened a sentence with
a capital `Things` that would have read as the domain noun outright — they take
*shapes*.

`CONTEXT.md` needed the **opposite** correction and it was the largest single
file: 19 sentences where the glossary had been converted to Thing but left the
noun lowercase — `A thing has a **Title**`, `**Selected thing**`, `**Active
thing**`, `the thing-to-rect map`, `arranging a space's things`. Those are the
domain noun and are now capitalised. `CONTEXT.md` has no lowercase `thing` left
at all.

`test/unit/ui-catalog.test.ts`'s 34 synthetic placeholders are `Widget`, which
appears nowhere else in the tree.

**A case-sensitive scan for word-boundary `Thing` over the sweepable trees now
finds it in two files only**: `CONTEXT.md`, where it is the domain noun, and
`AGENTS.md`'s ADR 0085 entry, which 04 removes. That is the criterion this issue
set itself.

### Verification

`pnpm verify:static` green — all seven commands, including `format:check` with no
reflow needed.

`pnpm test:coverage` red on **timeouts only, and a different set each run**: 12
tests over 7 files, then 1, then 2. Every failure is a `waitFor` or a 5000ms
test timeout, and every one passes in isolation in seconds
(`card-authoring.test.tsx`, `CanvasCard-rail-toolbar.test.tsx`,
`space-card-authoring.test.tsx`, `space-card-embedded-diagram.test.tsx` — 32 and
37 tests, all green, 5-11s). The machine's load average was **41.5** while the
suite ran and the full run took 278s against a normal 70-130s. This diff is doc
comments, prose and one placeholder identifier; none of it can reach the timing
of a test file it does not appear in.

`pnpm e2e` and `pnpm e2e:ladle` judged **inapplicable**: no component, test id,
label, CSS class, story id or behaviour changed. The three story `note` strings
that did change are asserted nowhere — they are rendered text in a review story
and `grep` finds each in its own file only.
