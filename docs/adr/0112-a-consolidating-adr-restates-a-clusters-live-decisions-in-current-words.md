# A consolidating ADR restates a cluster's live decisions in current words

Status: proposed

The ADR log records decisions in the words and circumstances in which they were
made. Refinements and renames leave accepted bodies describing rules that no
longer hold alongside rules that still bind. Reading the current design requires
reconstructing that history. The append-only rule preserves the reasoning, but
its instruction to put consolidation in `CONTEXT.md` asks a glossary to carry
structural decisions that do not belong there.

Adopt consolidating ADRs: a new numbered ADR restates one cluster's live
decisions in current vocabulary, with their constraints, rejected alternatives
and accepted costs. It changes where the current rules are stated without
re-deciding them. The log remains the binding record; `CONTEXT.md` remains the
glossary. This proposal follows the audit in
[approach.md](../../.scratch/adr-consolidation/research/approach.md), §4.1.

## Consolidation preserves decisions and their sources

A consolidation is a separate change from any structural decision. Its author
reads the sources' status blocks, refinements, supersessions and renames before
deciding what still binds. Code and tests establish build status; they do not
silently overrule an accepted decision. An unresolved disagreement is settled
separately before the affected source can be consolidated.

Each live rule appears in the new ADR in present-tense language, naming its
source and retaining the reason for the boundary. Negatives are explicit:
discarding a proposal such as a separate arranged-result type is a decision to
carry, even when little else in its source survives. Detailed historical
reasoning stays in the source. The consolidation must contain enough of the
reasoning to explain the rule without requiring that historical reading.

Every consolidating ADR ends with a provenance table. It has exactly one row
per source in its `Consolidates` field, with columns for the source number, the
sections carrying its live rules, the sections carrying its negatives, and
anything dropped as obsolete with the decision that made it obsolete. All live
decisions of a source must be carried before the source moves. A partly covered
source stays accepted outside the consolidation and may be cited as related.
Provenance makes omissions reviewable; a test cannot prove that the prose
preserves a decision.

## Status, location and reading order

An accepted consolidating ADR uses the ordinary `accepted` status and declares
`Consolidates: NNNN, …`. Each source receives `Status: consolidated` and exactly
one `Consolidated into: NNNN`, pointing back. These fields are reciprocal. A
proposal does not retire sources: the pair and source moves take effect together
when the consolidation is accepted.

`consolidated` means that the source's surviving decisions bind through its
consolidator. `superseded` means that another decision replaced it. Consolidation
does not change already-superseded or rejected ADRs into consolidated ones; those
remain historical context rather than sources in `Consolidates`.

Consolidated sources live in `docs/adr/consolidated/`, and only consolidated ADRs
live there. Their numbers and filenames never change. Their bodies are frozen;
status-block maintenance and relocation are the only changes. Existing
refinement, rename and supersession links remain intact. A reader encountering
a source follows `Consolidated into` to its current rule and uses the provenance
table to find the section. The source body explains the historical reasoning.

`docs/adr/README.md` continues to list exactly the accepted ADRs. A consolidating
ADR's row also lists its source numbers in a consolidation column; source ADRs
leave the accepted index. Read the index, the glossary and the relevant
consolidating ADR before consulting source bodies. Build-status notes remain
separate from decisions and may point out what is not yet implemented. Duplicate
current-rule prose in AGENTS.md and scoped guidance shrinks to a pointer as each
cluster is consolidated, retaining operational gotchas and build status.

An ordinary refinement can refine a consolidating ADR. When another generation
is warranted, it consolidates the previous generation and the accepted refiners
whose decisions it absorbs. Earlier sources keep their immediate links rather
than being relinked to the newest generation. This uses consolidation, not
supersession, for a restatement that changes no decision. Readers and tools
follow successive status links; targets must exist and cycles are invalid. A
real replacement of a decision still uses supersession.

Number citations such as `ADR 0040` remain valid across directories. Do not
rewrite them en masse. When editing a comment for another reason, prefer the
consolidator for a current rule and retain the source for its rejected
alternative or historical reasoning. File links to relocated ADRs must be
updated in the same change; stable numbers alone do not preserve relative paths.

## The bounded vocabulary exception

Accepted bodies remain immutable except that a rename's tracked codemod may
update the vocabulary of accepted consolidating ADRs in place. It may change
names only, never rules, negatives or trade-offs. The rename has its own ADR and
the same review and vocabulary checks as a code rename. The codemod must not
rewrite bodies under `consolidated/` or `superseded/`, or ordinary accepted ADRs.
Status-block updates remain permitted throughout the log.

This exception keeps the current statement readable after a rename without
minting a new generation solely to change words. The sources and the rename ADR
preserve the previous language. The vocabulary guard scans accepted ADRs whose
status block declares `Consolidates`; archived generations remain historical.

## Adoption includes the guards

Acceptance of this meta ADR lands with the supporting tooling and reading-rule
changes, before any cluster is moved:

- `adr-status-blocks.test.ts` checks the reciprocal pair, one consolidator per
  source, directory and README membership, provenance coverage, and resolution
  across generations, including missing targets and cycles.
- `knowledge-spaces.ts` reads `consolidated/`, preserves Resource identity derived
  from ADR numbers, adds a consolidation Graph and identifies consolidated
  sources in their titles. Its fixtures exercise the new directory and links.
- `current-domain-vocabulary.test.ts` includes accepted consolidating bodies in
  its current-vocabulary scan, with explicit treatment of historical citations
  so provenance can still name unchanged source filenames.
- `scripts/adr-health.ts` reports refinement counts, retired-vocabulary shares
  and code-citation counts. It is a diagnostic, never a verification gate or an
  automatic mandate to consolidate. Semantic obsolescence requires judgement.
- `workflow.md` and `domain.md` state the append-only exception, status semantics,
  citation policy and reading order defined here.

The first application is a Map and Graph pilot, separately reviewed. Fix its
comprehension questions before drafting it, then compare a fresh reader's
answers using the index, glossary and consolidation with answers using the
source ADRs. Correctness, retained negatives and reading cost decide whether to
continue. A word-count target alone cannot establish fidelity. Later clusters
land one per change; adopting this process does not approve their content.

## Alternatives and cost

**Separate digests or a normative specification layer** would add another
current-state document to maintain beside the log and existing guidance.
Consolidation keeps the review point and authority inside the ADR system.

**Rewriting accepted source bodies** would erase the reasoning available to a
reader following a code citation. **Tombstones** would push that reasoning into
git history. Keeping frozen sources in the tree preserves it. **Archiving alone**
cannot account for a source that is partly obsolete and partly binding.

The cost is another status to understand, a reviewed provenance table for each
cluster, and a possible extra hop from a rule to its full reasoning. A
consolidation can still omit or distort a live rule despite passing mechanical
checks. Review and the pilot's comprehension check address that risk; the
guards establish navigability and vocabulary, not semantic equivalence.

This ADR remains proposed. The tooling and workflow changes above are not yet
implemented by this draft, and no source ADR is consolidated by it.
