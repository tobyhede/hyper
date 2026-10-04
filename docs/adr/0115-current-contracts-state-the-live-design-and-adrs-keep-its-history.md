# Current contracts state the live design, and ADRs keep its history

Status: accepted
Related: 0116

ADRs record decisions in the words and circumstances in which they were made. Refinements and renames leave accepted bodies that describe rules which no longer hold beside rules that still bind. To read the current design, a contributor had to reconstruct that history from the ADRs, the glossary, `AGENTS.md` and overlapping scoped guides, and those summaries carried implementation history and repeated the same rules in several places. Updates were costly, and disagreements were hard to see.

Adopt **current contracts**. A current contract states one topic's accepted design in present-tense current vocabulary, with the reason for each rule, the alternatives rejected, the costs accepted, links to its source ADRs, and the accepted behaviour that is not yet built. It is the ordinary entry point for working on that topic. It does not decide anything: the ADR log stays the binding record of decisions, and `CONTEXT.md` stays the glossary.

## Who owns what

- **`AGENTS.md`** points the way. It holds the project summary, universal constraints and a pointer to the contract for each topic. It does not restate a contract's rules.
- **`CONTEXT.md`** defines terms and the distinctions between them. A definition stays there; behaviour belongs in a contract.
- **A current contract** owns its topic's architectural rules. Each cross-package rule has exactly one owning contract. Other guidance links to it instead of restating it, and keeps only operational gotchas specific to its own area. Contracts live in `docs/agents/`, in an existing scoped guide where one fits, and are reached through explicit pointers. Nothing depends on a harness loading nested files implicitly. Package-local guidance is added only where a reading-path evaluation shows it helps, and it then replaces the account it duplicates rather than copying it.
- **The ADR catalogue** (`docs/adr/README.md`) discovers decisions, one line each, and points current-design work at the owning contract.
- **ADR bodies** keep the full reasoning, the rejected alternatives and the history. Their bodies, numbers, filenames and status relationships do not change: status-block maintenance remains the only edit an accepted ADR receives.
- **Delivery issues** under `.scratch/` own build status, implementation gaps and completed-work narratives.

## Reading order

Start at `AGENTS.md`, use `CONTEXT.md` for terms, then read the owning contract for the topic. Open a source ADR when you need the full argument for a rule or a rejected alternative, or the history. A topic without a contract is read as before, through the "Decided" entries in `AGENTS.md`, the scoped guides and the ADR catalogue, and `workflow.md` keeps the one list of topics that have a contract, so a partial migration cannot appear to cover the whole repository.

## Authority and conflicts

A contract cannot silently override an accepted decision. When a contract and an accepted ADR disagree, or two accepted sources do, the disagreement is surfaced and resolved explicitly. The latest prose and the current code are not automatic authorities. A resolution that changes what an accepted ADR decides, or that an ADR requires to be recorded, is a new decision under the ADR admission rules ([`workflow.md`](../agents/workflow.md#when-to-write-an-adr)). A resolution that only settles which of two accepted sources holds, or that records treatment no ADR states, is recorded in the contract with its date and in its source inventory.

Implementation evidence is distinct from accepted design. Code shows what is built. It does not show what is decided, and code alone never retires an accepted rule. A contract lists accepted behaviour that is not built separately from its rules, links each gap to its delivery issue, and drops the gap note in the change that verifies the implementation.

## Maintenance

- An ADR that is accepted updates its topic's owning contract in the same change.
- A term that is coined, sharpened or retired updates `CONTEXT.md` in the same change.
- A wording correction or a faithful restatement in a contract needs no ADR.
- An ADR is written only for a decision that is hard to reverse, surprising to someone who knows the domain, and a real trade-off with a rejected alternative and an accepted cost. Routine treatment and implementation detail stay in their issue, tests, stories or code.

## Migration

Topics move one per change, each with a reviewable rule-to-source inventory, reader questions fixed against the sources before drafting, removal of the duplicate accounts it replaces, and a fresh-reader check through the adopted reading path. `workflow.md` states the steps. Mechanical checks show that links resolve and vocabulary holds; they do not show that a contract is faithful to its sources, which is what the inventory review and the reader check are for.

## Evidence

The Map and Graph pilot ([`REPORT.md`](../../.scratch/adr-consolidation/pilot/REPORT.md)) compared fresh readers answering ten fixed questions. Through the existing guidance, two readers scored 3/10 and 2/10. Through a single contract, two readers each scored 10/10, reading about 3,700 words in two files against 16,000–18,600 words in six to eleven. The commonest baseline failure was a reason missing or replaced by an appeal to authority. Others were a rule taken from an ADR body that a later ADR had changed, a fixture sentence read as a general rule, and an undo stated as working because one summary implied it. The sample is small, and every reader had the pre-adoption `AGENTS.md` in context. That contract is now [`docs/agents/maps-and-graphs.md`](../agents/maps-and-graphs.md), the first adopted contract.

## Alternatives and costs

**Consolidating ADRs.** The earlier draft of this ADR proposed a new numbered ADR to restate each cluster, together with a `consolidated` status, a `consolidated/` directory, successive generations and a codemod exception for renaming inside accepted bodies. It kept authority inside the ADR system, but at the cost of new statuses, a directory move, generation rules, and guards for each of them. A restatement would also have been frozen like every other ADR, and so would have aged in the same way. A contract that stays editable, and that is updated in the same change as each decision, avoids both.

**Consolidation in `CONTEXT.md`**, as `workflow.md` previously directed. This asks a glossary to carry structural decisions, rejected alternatives and build status, which is what made it long and mixed.

**Rewriting accepted ADR bodies.** This would erase the reasoning a reader reaches by following a code citation.

**Package-local guidance everywhere.** Not supported by evidence yet. It is permitted where an evaluation shows it helps readers find the rules.

**The cost** is a second current-state document beside each topic's ADRs that must be kept accurate, and an extra hop from a rule to its full reasoning. One owner per rule, the same-change rule and the inventory keep that cost bounded. A contract can still misstate a rule while passing every mechanical check; review and the reader evaluation are the controls for that.
