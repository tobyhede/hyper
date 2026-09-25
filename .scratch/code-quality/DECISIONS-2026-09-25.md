# Code-quality decisions — 2026-09-25

Confirmed by the user during the audit follow-up. These decisions guide the work; they do not claim implementation is complete.

- **Ticket 24:** Explain blocked saves, identify and provide access to the blocking Space, preserve unsaved Edits, and offer explicit Retry. Do not automatically replay merely because the blocker resolves.
- **Ticket 22:** Keep the existing request-size limit, explain refusals and preserve Edits so the author can reduce content and retry. A candidate reduced below the limit can already save. Reconsider the limit or transport only with further evidence.
- **Tickets 11–12:** Inventory and classify repository- and source-inspecting tests first. Preserve meaningful architectural checks; replace brittle assertions with behavioral tests and remove redundant checks only after individual approval. Classification and implementation belong in separate PRs.

## Infrastructure decisions for ticket 13

Reference: [13 — Decide on SQLite, mutation testing and the TypeScript 6 bridge](issues/13-decide-sqlite-mutation-testing-and-the-typescript-bridge.md). The existing issue is left unchanged; this note records the decisions without claiming its cost-and-evidence acceptance work is complete.

- **SQLite is essential supported functionality.** Retain its runtime, shared repository contract tests, integration tests and browser persistence proof in CI. Reduce duplication without reducing coverage.
- **Mutation testing remains an optional, targeted diagnostic.** Use it for important logic and suspected test gaps. Keep it outside mandatory CI gates and do not introduce a score threshold. Recent campaigns exposed real defects, supporting selective use.
- **Keep the TypeScript 6 compatibility bridge.** TypeScript 7 remains authoritative. Do not add a separate TypeScript 6 typecheck or change source to satisfy its diagnostics. Remove the bridge only once dependent tools support the replacement compiler API and full verification passes.

No removal or additional implementation tickets follow from these three retention decisions.

## Subsequent clarification

Ticket 25 (mutation testing in CI) is deferred and excluded from the active implementation queue. Retaining optional local mutation testing does not authorize implementing ticket 25.
