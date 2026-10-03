# Layered context and current architectural contracts

Status: ready-for-agent

## Problem Statement

Contributors must reconstruct the current design from historical ADRs, refinements, renamed concepts, the glossary and overlapping agent guides. An accepted ADR can contain both surviving constraints and obsolete statements. Current summaries also carry implementation history and duplicate rules, making updates costly and disagreements difficult to resolve.

The historical record preserves valuable alternatives and reasons. Contributors need a shorter, dependable route to the rules relevant to their task while retaining access to that record.

## Solution

Provide layered context: a concise project-wide entry point, one shared domain glossary, and maintained current contracts disclosed by task scope. Reuse existing scoped guides before introducing new locations. Each cross-package rule has one owning contract; other guidance links to it. Package-local guidance is optional when it improves discovery and replaces an existing account.

Preserve historical ADR bodies, identifiers and existing status relationships. A current contract states accepted design in current language with the important reasons and source links. It is the ordinary reading entry point, not permission to overturn a decision. Explicitly identify accepted-but-unimplemented behavior and link its delivery issue. Conflicts are resolved explicitly rather than treating the latest prose or current code as automatic authority.

Begin with a Map/Graph pilot. Compare fresh-reader comprehension before adopting the policy, then migrate the remaining topics in independently verifiable slices. Revise the existing proposed ADR 0112 rather than create a second proposal about the same choice.

## User Stories

1. As a contributor, I want the root guidance to identify the context relevant to my task, so that unrelated rules do not obscure my work.
2. As a contributor, I want one shared definition of Resource, Map, Graph and Space, so that package boundaries do not fragment the domain language.
3. As a contributor, I want current architectural rules stated together, so that I can work without replaying refinement history.
4. As a contributor, I want important reasons beside surprising constraints, so that I avoid reversing deliberate decisions.
5. As a contributor, I want source ADR links, so that I can investigate alternatives and accepted costs when necessary.
6. As a maintainer, I want historical ADR bodies and identifiers preserved, so that existing reasoning remains discoverable.
7. As an agent, I want precise task and path triggers, so that I can choose the right guidance reliably.
8. As an agent, I want package-specific guidance to add only local constraints, so that shared rules have one owner.
9. As a contributor, I want cross-package contracts in a shared location, so that a boundary is described consistently from either side.
10. As a reviewer, I want a rule-to-source inventory during migration, so that omitted constraints and rejected alternatives are visible.
11. As a reviewer, I want disagreements surfaced before a rule is restated, so that cleanup does not silently redesign the application.
12. As a contributor, I want accepted design distinguished from implemented behavior, so that I do not mistake a planned capability for a working one.
13. As a maintainer, I want delivery status owned by issues, so that completed implementation narratives do not accumulate in the glossary.
14. As a decision author, I want clear ADR admission criteria, so that routine implementation choices do not expand the architectural record.
15. As a decision author, I want the owning current contract updated with each accepted decision, so that current guidance remains accurate.
16. As a contributor, I want nested glossaries reserved for genuinely distinct domain contexts, so that architectural layers do not invent competing vocabularies.
17. As a maintainer, I want a measured pilot before broad migration, so that readability improvements do not sacrifice correctness.
18. As a reviewer, I want fresh readers to answer fixed questions, so that evaluation tests comprehension rather than matching the new document's wording.
19. As a contributor, I want the ADR catalogue to route me to current guidance while retaining decision discovery, so that historical and implementation tasks both have a clear starting point.
20. As a maintainer, I want obsolete duplicate instructions removed within each migration, so that the new structure reduces maintenance work immediately.

## Implementation Decisions

- Keep the single-domain model. Separate glossary contexts require distinct domain models or vocabulary, not merely separate packages.
- Retain the root guide, shared glossary, scoped guides, ADR catalogue and historical record, but give each an explicit responsibility.
- Use existing scoped guides as the initial current-contract locations. Consider package-local guidance only where a reading-path evaluation supports relocation. Do not depend on implicit nested-file loading; retain explicit routing.
- Place each architectural rule in one owning current contract. Keep concise definitions in the glossary, and references elsewhere. Historical quotations of earlier decisions remain historical evidence.
- Keep current contracts editable. A wording correction or faithful restatement does not itself require a new ADR. A changed decision must follow the ADR admission policy and conflict-resolution process.
- Revise proposed ADR 0112 to record the chosen ownership, authority, reading order and maintenance obligations. Preserve its provenance discipline and fresh-reader evaluation. Do not introduce consolidation statuses, archive directories or generations for this approach.
- The pilot is non-normative until evaluated. Adoption integrates its current contract, policy, routing and removal of duplicate live accounts together. A failed pilot produces findings and an adjusted proposal rather than automatic rollout.
- Retain existing ADR numbering, bodies, relationship metadata and navigation checks. Adapt consumers only when changed index or guidance links require it; preserve ADR identity and historical navigation.
- Require every migrated rule and valuable rejected alternative to be accounted for in a reviewable source inventory. An omitted historical claim needs an explicit classification and reason; implemented code alone cannot retire an accepted decision.
- Describe intended architectural behavior separately from outstanding implementation gaps. Link gaps to delivery issues; remove a gap note when implementation is verified complete.
- Keep architectural records focused on meaningful reversal cost, a surprising constraint, and a real rejected alternative with its accepted cost. Routine treatment and implementation details remain in their issue, tests, stories or code.
- Update the owning contract in the same change that accepts an architectural decision. Update terminology when a term is resolved. Migrations replace duplicate rule prose with pointers within each topic slice.
- Publish the adopted reading and update rules once. Give unmigrated topics an explicit existing route during rollout; do not imply that a partial migration covers the whole repository.
- No application behavior, transport contract, persisted schema or runtime API changes are required.

## Testing Decisions

- Primary seam: the contributor's end-to-end reading task. Start from normal project guidance with a concrete task, follow the available pointers, answer fixed questions and identify the applicable rule and rationale. Evaluate observable comprehension rather than exact document text or heading structure.
- Fix the question set and expected answers against the source decisions before drafting the pilot. Record unresolved ambiguities; resolve them explicitly before scoring or adoption.
- Use independent fresh readers for baseline and candidate routes so reading the baseline does not teach the candidate evaluator. Give equivalent tasks and record sources read, answers, errors, elapsed reading time where measurable, and words or documents encountered. Attribute measurements to the tested snapshot.
- The Map/Graph pilot covers: authored Map versus automatic arrangement; listing versus first working load of a mapless Space; empty Map creation with an Active Graph; explicit Resource membership and removal; one-axis displacement; memoryless Close; and the surviving reason for rejecting an intermediate Arrangement type.
- Pass correctness only when every fixed question preserves the relevant live constraints and important negatives, with no new unresolved contradiction or dead-end required pointer. Assess reading effort separately; a shorter incorrect answer cannot pass.
- Extend the same seam with a small topic-specific question set for Resource behavior, editing and persistence, UI/rendering, HTTP and tooling. Each migration includes its own route, faithful contract, duplicate removal and validation evidence.
- Reuse existing ADR status/index and domain vocabulary checks where changed material falls within their scope. Existing source-inventory and knowledge-document consumers need targeted checks only if their inputs or navigation change.
- Validate changed links and routed destinations. Mechanical checks establish referential integrity; they do not prove semantic fidelity. Review the source inventory explicitly.
- Avoid exact prose snapshots, new word-count gates, a general documentation framework, or application tests that merely mirror documentation. Run the repository-required relevant checks and report what was actually observed.

## Out of Scope

- Changing Resource, Map, Graph or Space semantics while migrating documentation.
- Implementing accepted but unbuilt product capabilities.
- Rewriting historical accepted ADR bodies, renumbering decisions, or bulk archiving partly live decisions.
- Introducing nested domain glossaries without evidence of separate domain contexts.
- Mandating package-local guidance throughout the repository before the pilot establishes its value.
- Adopting the proposed consolidation status and generation machinery.
- Updating globally installed skills or changing their upstream conventions.
- Building a new documentation website, search service or automated semantic-equivalence checker.

## Further Notes

The conversation's HTML sketch is explanatory, not an adopted policy. The prior ADR audit is useful source material, but its percentages and drift findings must be attributed to its dated snapshot and rechecked where used.

The pilot precedes policy adoption; policy adoption precedes broader topic migration. Publication of this spec and its tickets authorizes planning artifacts, not a claim that ADR 0112 is already accepted or that any migration has passed evaluation.

The user approved the reader-task validation seam and the seven-ticket breakdown, including its blocking edges. Ticket 01 is the initial frontier; adoption remains gated on a successful pilot evaluation.
