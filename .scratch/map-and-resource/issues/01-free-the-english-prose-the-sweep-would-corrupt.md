# 01 — Free the English prose the sweep would corrupt

**Status:** ready-for-agent
**Blocked by:** none

**What to build:** Read every lowercase `thing`/`things` and `diagram`/`diagrams` that the codemod reports as sitting in prose behind an English determiner, and reword the ones that are ordinary English rather than the entity, so that when 02 sweeps, no comment or document says "the same resource" where its writer meant "the same thing".

**Why:** This is ADR 0085's ticket 01 inverted, and it is the one category no mask table can reach. That ticket substituted generic *thing* for *entity* so the incoming domain noun would not land beside the word it had taken. The risk now runs the other way: the sweep is a plain substring substitution, so a genuine English "both mean the same thing" becomes "both mean the same resource" — not a collision, simply wrong text, and invisible inside a 487-file diff. `packages/app/src/diagram-resolution.ts:6` is the proof; it was found by previewing one file, and nothing in `verify` would ever have reported it.

The list is **generated, not grepped**. `node .scratch/map-and-resource/rename-diagram-to-map-and-thing-to-resource.mjs --dry` reports every site with its file, line and surrounding text. Last cycle the equivalent read was a grep someone remembered to do, and it triaged 325 hits down to 26 conversions across 22 files.

**Scope:** 491 sites. The heaviest files are `packages/core/src/schema.ts` (34), `README.md` (31), `packages/graph/src/validate.ts` (19), `packages/graph/test/space-intake.test.ts` (18), `packages/graph/src/placement.ts` (18), `packages/core/test/schema.test.ts` (15), `packages/app/src/components/CommandDock.tsx` (13), `packages/app/e2e/presenting.spec.ts` (12).

**The report over-reports on purpose.** Roughly `a thing` (113), `A thing` (35), `a diagram` (31) and `A diagram` (11) are the domain noun written in lowercase prose, and those sweep *correctly* — they need reading, not changing. The English is concentrated in `one thing` (67), `the only thing` (28), `two things` (26), `every thing` (20), `same thing` (19) and `three things` (11).

**Which word replaces it is decided per sentence, not by a table.** Where the sentence means the supertype, it says **entity** — ADR 0085 established that and this rename does not reverse it. Where it is ordinary English, reword: "one thing" that means "one point" says so, and a sentence whose only load-bearing word is *thing* is rewritten rather than substituted.

- [ ] `--dry` reports zero prose sites, or every remaining one is recorded in the `## Answer` as read and deliberately left because it is the entity.
- [ ] No sentence anywhere in the sweepable trees asserts something its writer did not mean, as a result of this ticket's rewording.
- [ ] The `## Answer` lists the sites that were reworded rather than substituted, because those are the ones a reviewer cannot check by eye against the original.
- [ ] `pnpm verify` passes. No behaviour changes here — this ticket touches comments, documents and one or two test descriptions.

## Answer

<!-- Filled in as the work lands. -->
