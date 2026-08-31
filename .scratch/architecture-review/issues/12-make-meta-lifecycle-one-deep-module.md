# Make repository Meta lifecycle one deep module

Status: needs-triage
Tags: release/v1, Improvement
Blocked by: `space-cards/03` — Build the Space Card lifecycle and aggregate persistence

Surfaced by: the 31 August 2026 Space Cards architecture review, candidate
“Make Meta lifecycle one deep module”. Validated against the in-flight
`feat/space-cards-03` tree at `1625117c`.

## The problem

The permanent Meta invariant is distributed across mechanisms that cannot
enforce it together:

- `20260831T0159_add_repository_state/migration.ts` creates and conditionally
  seeds the singleton row from the legacy Entry Space;
- `lockRepositoryState` assumes that row exists when complete reads and commits
  need it;
- `establishMetaSpace` lets bootstrap and administrative import create it;
- truncation deletes it separately from the aggregate it identifies;
- startup, normal commit and the future complete import each carry a different
  part of the invariant.

The result is a shallow lock helper with a large implicit interface: callers
must know whether Meta state has been established, whether the operation may
replace it, which transaction owns the lock, and what an empty repository
means. A missing row becomes a runtime failure far from the operation that
failed to establish it.

This is the persistence half of `v1-release/01`; it must not create a second
meaning of Meta beside that ticket.

## Direction to investigate

Concentrate Meta establishment, validated read, transactional lock and
administrative replacement behind one repository Meta lifecycle seam. The
module should own these rules:

- an authored commit may neither change nor delete the configured Meta Space;
- an empty repository has an explicit establishment path rather than a
  lock-time surprise;
- bootstrap and complete administrative import are the only operations that may
  establish or replace Meta identity;
- complete aggregate reads and integrity-affecting commits read the same
  validated identity;
- truncation/replacement changes Spaces and Meta state in one transaction.

PostgreSQL and memory are two real adapters at the seam. Storage mechanics stay
inside each adapter; callers use domain-shaped lifecycle operations and do not
know row, singleton-key or locking details.

Do not layer a new helper over `lockRepositoryState` and
`establishMetaSpace`. The deletion test applies: the old helpers and their
caller-owned ordering rules should disappear into the deeper module.

## Release relationship

This should be designed with `v1-release/01`, then reused by
`v1-release/08`. Building either release ticket first would harden the current
distributed invariant into more startup and CLI callers.

## Acceptance for triage

- [ ] Name the module and its external interface without exposing SQL locking or
      singleton-row vocabulary.
- [ ] Show how both memory and PostgreSQL satisfy the seam without duplicating
      Meta policy.
- [ ] Assign establishment, ordinary authored commit, complete read,
      administrative replacement and truncation exactly once.
- [ ] Prove missing/invalid Meta state, immutable Meta identity, and atomic
      replacement through shared behavioural tests at the module interface.
- [ ] Update `v1-release/01` and `v1-release/08` to consume this issue rather
      than restating persistence ordering in their implementations.
