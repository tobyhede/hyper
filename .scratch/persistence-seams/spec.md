# Persistence seams

Source: `/improve-codebase-architecture` review, 2026-08-04.

Two findings in the HTTP/persistence stack. Neither is urgent; both are the kind
of duplication that stays correct only while someone remembers to keep it correct.

## Issues

- `01` — one repository seam, declared once, with a shared contract suite.
  **Resolved.** The declaration is `packages/persistence/src/repository.ts` and
  `SpaceRepository` extends it; `StoredSpace` and `SpaceResourceCommitResult`
  are gone in favour of `LoadedSpace` and `RepositoryCommitResult`. The suite is
  `test/support/repository-contract.ts`, not a `@project/persistence` subpath —
  it is written against `SpaceRepository`, which the browser-safe package may
  not see. Its PostgreSQL half is unrun; see the ticket's `## Answer` for that
  and for the three behaviours the contract deliberately omits.
- `02` — four whole-snapshot parses per commit, one of them redundant.
  **Resolved** (`a0f7632`). It left one thing behind deliberately: two raw Zod
  messages on the import path, which is the shape AGENTS.md forbids under "a
  wire codec throws prose, not Zod". Those are **now swept too** —
  `describeSchemaFailure` in `postgres-space-repository.ts` gives `parseImport`
  and `parseSnapshotShape` the summary `decodeSnapshot` already gave the wire
  codec — so no raw `parsed.error.message` reaches a client anywhere in the
  tree.

## Note

`SpaceBackend` is the healthiest seam in this stack and is the model for `01`: it
has a shared contract suite (`packages/persistence/test/backend-contract.ts`) run
against both its adapters, and it is the only seam here where the second adapter
demonstrably constrained the interface.
