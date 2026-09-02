# Concentrate aggregate commit semantics

Status: resolved
Tags: Improvement
Blocked by: none — PR 134 delivered both adapter decision trees to compare

Surfaced by: the 31 August 2026 Space Cards architecture review, candidate
“Concentrate aggregate commit semantics”. Validated against the in-flight
`feat/space-cards-03` tree at `1625117c`.

## The problem

`MemorySpaceBackend.commit` and
`PostgresSpaceRepository.#commitInTransaction` independently decide the same
storage-independent outcomes:

- request identity and duplicate-Space checks;
- create/update/delete revision conflicts;
- candidate aggregate construction;
- incomplete-deletion conflict versus aggregate refusal;
- complete aggregate intake;
- assigned revisions and deleted Space identities.

The adapters should differ in storage mechanics. Instead they each own a copy
of the aggregate decision tree, including differently-shaped
incomplete-deletion logic. Repository contract tests can require the same
examples without proving the implementations will continue to make the same
decision for the whole input domain.

## Investigation before commitment

First add a differential behavioural test that runs generated valid stored
aggregates and change sets through both adapters and compares their public
outcomes. The property must include converging Space Card references, partial
and complete deletion proposals, create/update/delete revision conflicts, and
newly created ordinary Spaces.

- If the test finds a differing outcome, this becomes release correctness work.
- If it does not, duplication alone is not enough to rush a refactor into V1;
  retain this as a locality improvement and schedule it after the release.

## Direction if confirmed

Put storage-independent commit decisions behind one pure aggregate-commit
module in `@project/persistence`. Its interface should accept the current
loaded aggregate and one non-empty `SpaceCommit`, then answer either the public
outcome or the validated candidate plus the exact writes an adapter must
perform. It owns policy; it does not perform I/O.

Memory applies those writes to its map. PostgreSQL applies them inside its
transaction after taking the repository lock. Card-row ownership errors and
database transaction mechanics remain PostgreSQL implementation details.

Replace the two decision trees and replace shallow adapter-policy tests with
tests at the deep module's interface. Keep adapter contract tests for storage,
transaction and serialization behaviour.

## Release relationship

Potentially shared by `space-cards/03`, `v1-release/01` and
`v1-release/08`, but it is not yet a release blocker. Promote it to
`Tags: release/v1` only if the differential test proves an observable drift or
the Meta lifecycle design needs the shared decision module.

## V1 disposition

The differential property test is a checkpoint prerequisite. If it proves a
semantic disagreement, this ticket owns the shared pure aggregate-commit module
and blocks dependent persistence work until both adapters consume it. If the
adapters agree, record that evidence, resolve this ticket and defer the locality
refactor beyond V1. Duplication alone does not authorize the refactor.

## Acceptance for triage

- [x] A differential test establishes whether a real semantic disagreement
      exists before production code is moved.
- [ ] The proposed interface separates aggregate policy from storage mechanics
      and does not expose an adapter-specific transaction.
- [ ] The two existing decision trees are replaced, not wrapped.
- [ ] Tests at the shared interface cover every public commit outcome; adapter
      tests retain only behaviour particular to their storage implementation.

## Answer

The checkpoint found no observable semantic disagreement, so the direction-if-confirmed
acceptance items above did not activate: no shared interface was introduced, neither adapter
decision tree moved, and the existing adapter-policy tests remain. They stay unchecked rather than
claiming a refactor landed.

`test/integration/aggregate-commit-differential.test.ts` compares the public commit result and the
resulting loaded aggregate from `MemorySpaceBackend` and `PostgresSpaceRepository`. Its generated
valid aggregate contains two Space Cards converging on one ordinary Space. Mandatory examples plus
generated runs cover topology-preserving updates, newly created ordinary Spaces, create/update/delete
revision conflicts, partial and complete deletion proposals, a proposal whose changed Spaces retain
the deleted reference, duplicate Space changes, and mismatched snapshot identity. The two adapters
agreed across all cases.

This remains a locality improvement worth reconsidering after V1. Duplication alone does not justify
moving the production decision trees now, and the ticket is no longer tagged `release/v1`.
