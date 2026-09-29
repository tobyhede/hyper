# Compressing the ADR log: approach

Scope: a method for consolidating `docs/adr/`. The live-vs-obsolete measurement of each ADR is being done separately. This document designs what to do with that measurement.

## 1. Problem, measured

All numbers come from the tree at `a1562f34` on `feat/knowledge-spaces`, measured on 2026-09-29.

| Measure | Value | How |
| --- | --- | --- |
| Live ADR files (`docs/adr/0*.md`) | 82 (81 accepted, 1 rejected: 0016) | `ls` |
| Words in live ADRs | 62,629 (64,468 including README) | `wc -w` |
| Superseded ADRs (`docs/adr/superseded/`) | 24 files, 14,998 words | `wc -w` |
| Live ADRs refined at least once (`Refined by:`) | 47 of 82 | status blocks |
| Live ADRs refined 3 or more times | 13 (0064 ×6; 0046, 0048, 0069 ×5; 0002, 0003, 0005, 0014, 0039 ×4; 0010, 0015, 0033, 0068 ×3) | status blocks |
| Live ADRs carrying `Renamed by:` | 37 | status blocks |
| Live ADRs whose bodies use retired nouns more than current ones | 54 of 82 | capitalised Card/Layout/Route/Alias/Thing/Diagram against Resource/Map/Graph, with `LayoutStrategy*` excluded. This is a lower bound, because lower-case uses such as "layout" and "alias" are not counted. |
| Retired-noun tokens in live bodies, against current-noun tokens | 1,078 against 453 | same regex |
| `ADR NNNN` citations outside `docs/adr` and `.scratch` | 1,685 occurrences in 350 files | `git grep -o` |
| … of which in code (`.ts/.tsx/.css/.prisma`) | 1,395 occurrences in 320 files, citing 82 distinct numbers | `git grep -o` |
| … of which cite **superseded** ADRs from code | 75 (0026 ×23, 0045 ×16, 0025 ×12, 0006 ×8, 0058 ×5, 0019 ×4, 0055 ×3, 0011 ×2, 0021, 0031) | intersect with `superseded/` |
| Citations in `.scratch/` | 1,605 | `git grep -o` |
| Most-cited in code | 0040 (93), 0083 (90), 0079 (85), 0082 (61), 0106 (52), 0068 (49), 0084 (42), 0064 (39) | |
| Existing current-state prose | README index (82 one-liners), `CONTEXT.md` (6.3k words), AGENTS.md "Decided" (2.5k words), `docs/agents/*.md` (27k words, mostly rendering, ui and editing-and-persistence) | `wc -w` |

The shape of the problem:

1. **Live bodies contradict the live design.** ADR 0064's body still says "That displacement is derived and never written to the Layout". ADR 0084 reversed that. The body also says "Opening on an Algorithmic View converts it into a Layout under ADR 0025", and ADR 0025 is superseded. An agent that opens 0064, which is the right move by the README's own instruction ("Open an ADR when you are about to change what it binds"), reads three vocabularies and one reversed rule. It must then walk six `Refined by` links to rebuild the actual decision.
2. **Current state is already spread over four derived layers.** They are the README one-liners, `CONTEXT.md`, AGENTS.md "Decided" with its build status, and the build-status sections of `docs/agents/*.md`. None is held to the ADRs mechanically. So another prose layer adds a fifth copy and does not remove any reading.
3. **Code cites ADR numbers as the reason for invariants.** The comment rule in workflow.md step 3 keeps a citation exactly when "the cited document is where the reasoning for that constraint lives". So every citation is a promise that the numbered file explains the constraint. When a cited file is mostly obsolete, that promise is broken, and 75 citations already point into `superseded/`.
4. **The constraints on any fix:**
   - Numbers never change: 1,685 citations outside `docs/adr` and `.scratch`.
   - `scripts/knowledge-spaces.ts` derives each Resource id from `stableUuid('adr', 'adr:NNNN')`. It reads exactly two directories, `.` and `superseded/`.
   - `test/unit/adr-status-blocks.test.ts` enforces reciprocal links, one superseder per ADR, the rule that `superseded/` holds exactly the superseded ADRs, and the rule that the README lists exactly the accepted ADRs.
   - workflow.md says "**never merge, rewrite or consolidate ADRs**" and "Consolidation belongs in `CONTEXT.md`". But `CONTEXT.md` is a glossary: "No file formats, storage, or rendering libraries". It cannot hold structural decisions like 0040 or 0084. **The consolidation layer the rule points at cannot hold what needs consolidating.** That gap is the real defect. Whatever else is chosen, this rule has to change, and changing it needs an ADR.

## 2. Candidate approaches

Every candidate is judged against the same list:
- what agents read;
- what happens to citations, number stability, the knowledge-spaces script and the status-block test;
- which workflow.md rules change;
- maintenance cost;
- how it fails, and whether a test can catch the failure.

### (a) Cluster digests outside the log ("current design" docs)

**Mechanics.** Write one `docs/design/<cluster>.md` per README cluster (Domain, Map and Graph, Editing and persistence, HTTP, Canvas, UI, Toolchain). Each states the current decisions in current vocabulary and cites ADR numbers. AGENTS.md gains a rule to read the digest first and open an ADR only for the reasoning.

**What agents read.** The digest first, then an ADR on demand. ADR bodies stay noisy, and the README still sends agents into them.

**Effect on citations, numbers, script and test.** None. Numbers are untouched and the script and test are unaffected.

**Rule changes.** Only a reading-order rule, plus the amended "Consolidation belongs in" line.

**Maintenance cost.** High and permanent. A digest is a fifth current-state layer beside README, `CONTEXT.md`, AGENTS.md "Decided" and `docs/agents/*`, and every new ADR must update both.

**Failure modes.**
- *Drift.* Nothing binds a digest. It is not an ADR, so "An ADR binds structure" does not cover it, and neither the review point nor the status test sees it.
- *Mechanical guards are partial.* (i) Every accepted ADR number must appear in exactly one digest, which is checkable. (ii) Digests can be added to `current-domain-vocabulary.test.ts`'s scanned set, which catches rename drift. But no guard catches a digest that misstates a decision.
- *Overlap.* It duplicates what AGENTS.md "Decided" and `docs/agents/*` already try to be.

**Verdict.** Cheap to start and does not compress anything. It is the approach already tried four times.

### (b) Consolidating ADRs ("rebase" ADRs)

**Mechanics.**
- A new ADR, numbered next in sequence (0107 and up), restates the **live** decisions of one cluster in current vocabulary. Each decision is stated as a rule, the negatives it keeps, and the cost accepted.
- It declares `Consolidates: 0002, 0005, 0014, 0040, …`.
- Each source gets one status-line edit, `Status: consolidated` and `Consolidated into: 0110`, and moves to `docs/adr/consolidated/`. Its body is not touched.
- The consolidating ADR ends in a **provenance table**: each source number, the section that now carries each of its live decisions, and what was dropped as obsolete, with the reason.
- It re-decides nothing. It is "a Renames for structure": decisions keep their force, and only the text that states them moves.

**What agents read.** The consolidating ADR. A source body is read only for the story of how a rule came about.

**Effect on citations.** Unchanged and still valid. `ADR 0040` in code resolves in three steps: the file sits in `consolidated/`, its status line points to 0110, and 0110's provenance table names the section. Nothing is renumbered.

**Effect on the knowledge-spaces script.**
- Resource ids are stable because they derive from numbers.
- `readAdrs` must also read `consolidated/`, around line 437.
- It gains a `consolidates` Graph beside `refines`, `supersedes` and `renames`.
- Titles get a `(consolidated into NNNN)` suffix, in the way `(superseded)` works today.

**Effect on the status-block test.**
- New link pair `Consolidates`/`Consolidated into`, reciprocal.
- One consolidator per source, read transitively across generations as supersession already is.
- `consolidated/` holds exactly the `consolidated` ADRs.
- The README lists consolidating ADRs, with the sources in a column, and never lists a consolidated source.
- New: every `Consolidates` number appears in the consolidating ADR's provenance table, and no other number does.

**Rule changes.**
- workflow.md's "never merge, rewrite or consolidate" becomes "never rewrite; consolidate only by a consolidating ADR".
- The new status `consolidated` is added.
- "Consolidation belongs in `CONTEXT.md`" becomes "words in `CONTEXT.md`, structure in consolidating ADRs".

**Maintenance cost.**
- A one-off authoring cost per cluster: roughly 3–6k source words become about 1–2k. After that, the ordinary cost of writing an ADR.
- A consolidating ADR is itself append-only, so it gathers `Refined by` links again. The answer is a later **generation**: consolidation N+1 supersedes consolidation N and absorbs its refiners.
- The obsolescence criterion in §3 is what says when that is due.

**Failure modes.**
1. *A consolidation that silently re-decides or drops a live rule.* The provenance table makes the drop explicit and reviewable. The known live negatives, such as 0005's "no `Arrangement` type", have to appear.
2. *Rename drift.* The next rename leaves consolidating ADRs in old words again. See the recommendation (§4.3) for the one mutability that fixes this.
3. *Status confusion.* Readers must learn that `consolidated` means still binding, while `superseded` means no longer binding.

### (c) Frozen archive directory (CometBFT style)

**Mechanics.** Move obsolete ADRs into `docs/adr/archive/`, frozen, with a README saying "historical, not binding". CometBFT splits its Tendermint-era ADRs off into a separate list and starts new ones at 100. This repo already does half of this: `superseded/` is exactly a frozen archive with a tested directory rule.

**What agents read.** Only the non-archived set.

**Effect on citations, script and test.**
- Citations resolve by number across directories. The 75 code citations into `superseded/` show this works today.
- The script and the test need one more directory.

**Rule changes.** A new criterion for "archivable" that is not supersession. This is the hard part: an ADR that is 70% obsolete is still 30% binding. Archiving it either loses the 30%, or leaves it binding in a directory labelled "not binding".

**Maintenance cost.** Low.

**Failure mode.** A **partial** ADR has no correct home. Most of the problem ADRs are partial (0064, 0040, 0068, 0079), because they have been refined rather than replaced. Archiving alone only solves the fully overtaken ones, such as 0002.

**Verdict.** Useful as the *second half* of (b): the consolidated sources are what get archived. Not sufficient alone.

### (d) ADR versus spec split (Cosmos SDK, CometBFT)

**Mechanics.** Cosmos states the split directly: "The ADR provides the context, intuition, reasoning, and justification … The spec is a much more compressed and streamlined summary of everything as it stands today." Here the spec would be a `docs/spec/` normative current-state document per domain area, amended in place. ADRs become pure rationale.

**What agents read.** The spec for *what*, and an ADR for *why*.

**Effect on citations, script and test.**
- Unchanged numbers.
- Code could begin citing spec sections, which gives two citation schemes.
- The script is unaffected.

**Rule changes.** Large.
- "An ADR binds structure" moves to "the spec binds structure".
- Every future decision edits the spec as well as writing an ADR.
- The status and index conventions of the current log stop being the source of truth.

**Maintenance cost.** Highest. It is (a) made normative. A spec is mutable, so it needs its own review discipline, and here that discipline is only the ADR's `proposed → accepted` point.

**Failure modes.**
- Spec–ADR disagreement, where either one could be "right".
- It overlaps heavily with `docs/agents/*.md`, which is already a partial spec (`rendering.md` alone is 7.4k words).
- Drift can only be caught by a vocabulary scan and a coverage test ("every accepted ADR is cited by one spec section").

**Verdict.** The right shape for a mature multi-team project. For a solo prototype with a strong ADR culture it means rebuilding the documentation architecture. Consolidating ADRs (b) get most of the benefit inside the existing conventions.

### (e) Living ADRs (amend in place, with a changelog)

**Mechanics.** Allow accepted ADRs to be edited. A refinement is folded into the refined ADR's body and recorded under a dated `## Changelog`. Some teams do this in practice: they add new information "with a date stamp, and a note that the info arrived after the decision".

**What agents read.** One ADR per decision, always current.

**Effect on citations, script and test.** Numbers are stable, citations stay valid, and the script and test need no change.

**Rule changes.** This deletes "ADRs are append-only", the property workflow.md defends explicitly: "the wrong turns are the most instructive part of it … a tidied document would show only the correction". History moves to `git log`.

**Maintenance cost.** Every refinement edits N files. Review has to diff prose.

**Failure modes.**
- A code citation's meaning changes under it silently. The reasoning a comment pointed at can be rewritten away.
- The negatives, which are the most valuable content, get edited out when a body is "tidied".
- No test can tell a rule that was legitimately amended from one that was accidentally lost.

**Verdict.** Rejects the repo's central documentation principle. It could be defended for **vocabulary only** (see §4.3), not for decisions.

### (f) Tombstoning

**Mechanics.** Shrink an obsolete ADR's body to a stub: title, status, "Replaced by NNNN §X", and a one-line summary. The full text survives in git.

**What agents read.** Stubs, which cost almost nothing, redirecting to successors.

**Effect on citations, script and test.**
- Citations still resolve, but to a stub. A code comment keeping "ADR 0045" because "the reasoning lives there" would now point at a place where it no longer does. That is a direct breach of the comment rule's step 3.
- The knowledge-spaces Resources become empty.

**Rule changes.** Breaks append-only in the destructive direction.

**Maintenance cost.** Lowest.

**Failure mode.** The reasoning is lost from the tree, even though git can recover it.

**Verdict.** Moving a file to `consolidated/` gives the same reading benefit without deleting anything, so tombstoning is dominated by (b)+(c).

### Summary

| | Agents stop reading obsolete text | Keeps history in tree | Numbers and citations | New layers | Drift mechanically catchable | workflow.md change |
| --- | --- | --- | --- | --- | --- | --- |
| (a) digests | partly (README still points at bodies) | yes | unchanged | +1 | partly (coverage, vocabulary) | small |
| (b) consolidating ADRs | yes | yes | unchanged, resolve via provenance | 0 (replaces "Decided" entries) | yes (links, provenance, vocabulary) | moderate, needs an ADR |
| (c) archive | only for fully dead ADRs | yes | unchanged | 0 | yes (directory rule) | small |
| (d) spec split | yes | yes | two schemes | +1 normative | partly | large |
| (e) living ADRs | yes | no (git only) | meaning drifts | 0 | no | reverses core rule |
| (f) tombstones | yes | no (git only) | dangling reasoning | 0 | yes | reverses core rule |

## 3. Obsolescence criterion

An ADR is a **consolidation candidate** when either of these holds:

- **L < 50%**, where L is the live share: the fraction of the body's decision sentences that still state the current design. This comes from the separate per-ADR measurement.
- **R ≥ 3**, where R is the number of `Refined by` entries, **or** **R ≥ 2 and V ≥ 60%**, where V is the retired-vocabulary share of domain-noun tokens in the body.

A **cluster** is due for consolidation when either of these holds:

- at least one third of its ADRs are candidates;
- more than one of its candidates is cited from code at all. Code citations are what make a stale body expensive.

A **consolidating ADR** is itself due for its next generation when it reaches R ≥ 3.

**Computing it.**
- R and V are mechanical. R comes from the status block the test already parses. V uses the retired and current noun lists, which should be taken from `current-domain-vocabulary.test.ts`'s rename blocks so that a future rename extends it automatically.
- Put both in a small `scripts/adr-health.ts` that prints a table, including the code-citation count from `git grep`. It is a diagnostic, like the mutation runs, and not a gate. A threshold in `verify` would force consolidations at bad moments.
- L needs judgement. Record it where it can be refreshed: the consolidating ADR's provenance table lists each source's decisions as *carried*, *carried as negative* or *dropped (obsolete, why)*. That list *is* the L measurement, frozen at consolidation.

**Today's candidates, by R and V alone.** 26 ADRs, 18.8k of the 62.6k live words:

0002, 0003, 0005, 0007, 0010, 0014, 0015, 0018, 0020, 0027, 0030, 0033, 0035, 0039, 0042, 0046, 0048, 0063, 0064, 0068, 0069, 0074, 0076, 0078, 0079, 0087.

The V regex under-counts lower-case retired nouns: 0002 and 0039 score 0%, yet both are in the flagged list on R. The handoff's "fully overtaken" set (0002, 0005, 0039, 0046) is all present.

Note that 0005 is *not* fully dead. The README keeps its negative, "returns no separate arranged-result type", and workflow.md names it as *the* example of a valuable negative. That is exactly why consolidation must carry negatives rather than archive whole ADRs.

## 4. Recommendation

**Consolidating ADRs (b), with consolidated sources filed in a frozen directory (c). Change the append-only rule by ADR, first. Pilot one cluster before any rollout.** Digests (a) are rejected: the existing four derived layers show that unbound current-state prose drifts. The consolidation should instead *absorb* the AGENTS.md "Decided" entries for the clusters it covers.

### 4.1 Sequence

1. **ADR 0107, the meta decision.** Its title: *"A consolidating ADR restates a cluster's live decisions in current words"*. It:
   - `Refines` nothing in the log. It changes workflow.md, so it is the ADR that decides the process change.
   - Defines the `consolidated` status, the `Consolidates`/`Consolidated into` pair, the `docs/adr/consolidated/` directory and the provenance-table obligation. It keeps "never rewrite a source body".
   - Records the rejected alternatives (a), (d), (e) and (f) and the cost accepted: readers learn a third status, and reasoning lives one hop away from the rule.
   - Decides the vocabulary exception in §4.3.
2. **Tooling, in the same change as 0107.**
   - `adr-status-blocks.test.ts`: the link pair, the directory rule, the README rule, the provenance rule, and transitive generation reading.
   - `knowledge-spaces.ts`: read `consolidated/`, add a `consolidates` Graph, add the title suffix, and extend the test fixtures in `test/unit/knowledge-spaces.test.ts`.
   - `current-domain-vocabulary.test.ts`: move consolidating ADRs *out of* `HISTORICAL_TREES`. The simplest selector is files whose status block has `Consolidates:`. This lets a retired noun in a consolidating ADR fail `verify`. It is the one mechanical drift catch this approach has that a digest does not.
   - `scripts/adr-health.ts`, the diagnostic from §3.
   - workflow.md and domain.md reading rules: "a `consolidated` ADR still binds; read its consolidator".
3. **Pilot: Map and Graph core.**
   - Sources: 0002, 0005, 0014, 0015, 0040 and 0079, plus 0080 if its repair rule fits.
   - Why this cluster: it holds the most-cited ADRs in code (0040 ×93, 0079 ×85), the flagged candidates, and the three-rename vocabulary problem at its worst (0040 has 116 retired-noun tokens and 0 current ones).
   - Output: one ADR of about 1.5–2k words replacing about 3.2k.
   - Acceptance check: a fresh agent, given only README, `CONTEXT.md` and the consolidating ADR, answers a fixed set of about 10 questions. The questions come from 0040/0079/0014 and include "may a Map have no Graph?", "is a LayoutStrategy a Map?" and "why is there no Arrangement type?". Compare correctness and tokens read against the same agent given the sources.
4. **Retire duplicated prose for the consolidated cluster.** The AGENTS.md "Decided" bullets for the cluster shrink to one line pointing at the consolidating ADR, keeping build status only. The README row becomes one line for the consolidating ADR, with a "consolidates" column.
5. **Roll out by criterion, one cluster per change, never with a structural change.** This is the same discipline workflow.md applies to renames. Suggested order, by candidate density:
   1. Opening and in-place growth: 0064, 0066, 0084, 0093, 0070, 0073, 0102. Note that 0102 is recent, so it is included only if its status warrants.
   2. Reference and Space Resources: 0009, 0039, 0046, 0068, 0074, 0089.
   3. Intake and the new Space: 0010, 0018, 0020.
   4. Graph authoring: 0003, 0032, 0033, 0087, 0090.
   5. Editing and persistence: 0030, 0035, 0042, 0078.
   6. Escape and commit: 0048, 0063, 0065.

   Leave the Toolchain, HTTP and recent Edge ADRs (0100–0106) alone until they meet the criterion.
6. **Leave the rename ADRs (0041, 0085, 0092, 0101) in place.** They re-decide nothing. Once every ADR they `Renames` is consolidated, they are the natural first entries of a later "vocabulary lineage" consolidation, or they can simply stay as the record of *why* the words are what they are. That record is what stops a future session re-proposing Thing or Diagram.

### 4.2 Template

```markdown
# The Map and Graph model: a Map owns positioned Resources and the Graphs over them

Status: accepted
Consolidates: 0002, 0005, 0014, 0015, 0040, 0079
Refines: …            # only if it also narrows something outside the set (normally none)
Related: 0086, 0041, 0101

This ADR restates, in current vocabulary, the decisions of the ADRs it
consolidates. It re-decides nothing. Each decision below still binds with the
force it had. The reasoning and the rejected alternatives in full are in the
source named beside it. Consolidated sources are filed in `consolidated/`.

## Decisions

### D1. A Map is authored data; a LayoutStrategy is behaviour  (0014, 0005)
Rule, in two or three present-tense sentences.
**Do not**: introduce an arranged-result (`Arrangement`) type between a strategy
and the Resources it positions. Every consumer wants positions, and the type
would add a translation step at the seam (0005).
**Cost accepted**: …

### D2. A Map owns its Resource membership and a non-empty ordered set of Graphs  (0040, 0015)
…

### D3. The authored Map is the only selectable and addressable canvas context  (0079)
…

## Provenance

| Source | Carried | Carried as negative | Dropped as obsolete (why) |
| --- | --- | --- | --- |
| 0002 | D1 (a Map arranges, rendering is separate) | — | the View entity (0079 removed it from the domain) |
| 0005 | D1 | no `Arrangement` type | "a Layout is a named strategy" (vocabulary, 0014) |
| 0014 | D1 | no disambiguating prefixes (`AuthoredLayout`) | ELK strategy naming (0086 removed elkjs) |
| 0015 | D2 (a Space may hold no Graph and then cannot present) | — | … |
| 0040 | D2 | — | … |
| 0079 | D3 | no hidden compatibility machinery for computed views | … |

## Build status
Built / not built, per decision. This replaces the cluster's AGENTS.md "Decided" entries.
```

The rules the template encodes:
- Each decision heading names its sources.
- Negatives get a **Do not** line, because they are the most valuable content.
- The provenance table is the machine-checked link back.
- *Dropped* entries are where the L measurement lives.
- There is no lineage prose ("used to", "was later"). That stays in the sources.

### 4.3 The vocabulary exception (decide it in 0107)

The root cause is renames, not decisions. Without an exception, the next rename makes every consolidating ADR fail the vocabulary scan, and it would need a new generation just to change words. Recommendation: **a rename's tracked codemod may rewrite consolidating ADRs, and only those, in place**, and it must not open anything under `consolidated/` or `superseded/`. A rename ADR "re-decides nothing" by definition, so applying it to the words of the current-state layer changes no decision. The history of the words stays in the sources and in the rename ADR.

This is the one mutation of an accepted ADR the scheme allows, and it is bounded by the same instrument that proves renames complete. If the owner will not accept it, the fallback is to generate a new consolidation after each rename. That is correct but costly, and it is the thing most likely to make the scheme lapse.

### 4.4 Code comments citing old numbers

- **Do not rewrite citations en masse.** Numbers are stable, and the consolidated source is still present, still immutable and still where the *reasoning* lives. Under the comment rule's step 3, the citation stays valid, and the reader reaches the current *rule* in one hop via `Consolidated into`.
- **When a comment is edited for other reasons,** prefer the consolidating ADR if the comment states the current rule. Keep the source if the comment names the rejected alternative, for example `displace`'s "the per-Resource history ADR 0084 rejected". Add this line to workflow.md step 3.
- **Add a citation-resolution check,** e.g. an arm of an existing scan test or a new `adr-citations.test.ts`. Every `ADR NNNN` in scanned source must name a file in `docs/adr/`, `consolidated/` or `superseded/`. Citations of `superseded/` ADRs from code form a ratchet in the style of ADR 0062: 75 today, and the count may only fall. A superseded decision no longer binds, so a code comment giving it as the reason for an invariant is almost always a stale citation. A consolidated one is fine.
- **`.scratch/` citations (1,605) are untouched.** They are historical tickets.

### 4.5 Key trade-off

Consolidating ADRs keep the log as the single binding source and make drift test-visible, through reciprocal links, provenance and the vocabulary scan. The price:
- The append-only rule gets its first principled exception: sources change status, move and gain a new status, and consolidating ADRs follow renames in place.
- Every rule and its reasoning end up one hop apart.
- Each cluster costs a real authoring and review pass, and a consolidation that quietly drops a live negative is the failure the provenance table exists to expose in review, since no test can catch it.

## Sources

- CometBFT, `docs/references/architecture/README.md`: ADR versus spec ("a spec is more compressed and streamlined summary of everything as it stands today"), and separate numbering for legacy Tendermint ADRs.
- Cosmos SDK, `docs/architecture/README.md`: the same ADR/spec split.
- AWS Prescriptive Guidance on ADRs, and the architecture-decision-record repository (Joel Parker Henderson): immutability versus amending, superseding, and the "living document" practice with date-stamped additions.
- Repo: `docs/adr/README.md`, `docs/agents/workflow.md`, `docs/agents/domain.md`, `test/unit/adr-status-blocks.test.ts`, `scripts/knowledge-spaces.ts`, `test/unit/current-domain-vocabulary.test.ts` (`HISTORICAL_TREES`, line 142), ADRs 0005, 0014, 0040, 0064, 0079 and 0101.
