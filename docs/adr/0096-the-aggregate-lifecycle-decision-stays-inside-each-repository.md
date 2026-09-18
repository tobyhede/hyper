# The aggregate lifecycle decision stays inside each repository

Status: accepted
Related: 0078, 0094, 0095

`initializeAggregate` and `replaceAggregate` decide their outcome inside the repository that runs them. There is no pure `decideInitialize` or `decideReplace` beside `decideCommit`, and `classifyInitializedAggregate` stays the only lifecycle rule the repositories share as a function.

The architecture review of the database-persistence branch (2026-09-17) proposed lifting the lifecycle decision out of the PostgreSQL, SQLite and memory repositories, by analogy with ticket 20's `decideCommit`. Reading the three implementations closely did not support it. The shared decision is four branches: refuse a proposal that fails intake, raise stored Spaces without a Meta identity as an invariant failure, answer `uninitialized` or `conflict`, and classify through `classifyInitializedAggregate`. Those branches are interleaved with reads the SQL repositories take in a fixed order under a lock — the Meta row first, stored Spaces only when needed, and raw rows during replacement because stored state may not parse (ADR 0094). A pure decision would need that stored view assembled before it runs, changing when those reads happen, to move four conditionals.

`decideCommit` earned its module differently: the commit rules were substantial, one copy of them was unreachable from `@project/persistence`, and the copies disagreed on an observable refusal. Here, what differed between the copies is concurrency — PostgreSQL's per-row re-lock and revision re-check during replacement, and each SQL repository's recovery from a lost initialization race — which ADR 0095's one SQL repository owns. Once that lands there are two copies of the decision, SQL and memory, and `spaceRepositoryContract` runs the whole lifecycle group against both, so a divergence in what either answers fails a test rather than drifting.

Rejected: pure `decideInitialize` / `decideReplace` called by every repository, which moves the conditionals without concentrating anything the contract does not already verify. Sharing only the invariant error and intake refusal as helpers, which saves a string literal. Dropping `loadMetaSpaceId` by having `replaceAggregate` answer an empty repository by initializing it, which would reopen ADR 0078's single door for first state and ADR 0094's rejected unconditional replacement for the sake of one repository member and one import helper.

Revisit if a third lifecycle outcome or a third stored lifecycle implementation appears, or if the contract stops running against every repository.
