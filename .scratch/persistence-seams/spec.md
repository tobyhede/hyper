# Persistence seams

Source: `/improve-codebase-architecture` review, 2026-08-04.

Two findings in the HTTP/persistence stack. Neither is urgent; both are the kind
of duplication that stays correct only while someone remembers to keep it correct.

## Issues

- `01` — one repository seam, declared once, with a shared contract suite. Open
  (`needs-triage`); its claims were re-verified against the tree and corrected.
- `02` — four whole-snapshot parses per commit, one of them redundant.
  **Resolved** (`a0f7632`). It left one thing behind deliberately: two raw Zod
  messages remain on the import path (`src/persistence/postgres-space-repository.ts:103,111`),
  which is the shape AGENTS.md forbids under "a wire codec throws prose, not
  Zod". Nothing tracks them.

## Note

`SpaceBackend` is the healthiest seam in this stack and is the model for `01`: it
has a shared contract suite (`packages/persistence/test/backend-contract.ts`) run
against both its adapters, and it is the only seam here where the second adapter
demonstrably constrained the interface.
