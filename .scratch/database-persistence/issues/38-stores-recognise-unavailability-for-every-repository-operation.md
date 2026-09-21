# 38 — Stores recognise unavailability for every repository operation

**What to build:** A database outage has the same persistence-unavailable outcome for every repository operation, including reads outside transactions and reloads after conflicts. HTTP answers 503 for recognised outages, while PostgreSQL authentication and missing-database failures remain unclassified and count toward startup giving up. Classification depends on evidence carried by the failure, never on whether a transaction callback ran.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Tags:** Defect

## Context and design

The PostgreSQL driver lets connection-acquisition failures escape without normalising them. The repository recognises normalised driver failures on every operation, but compensates for raw acquisition failures only around transactions: any failure before the callback runs becomes unavailable. Direct operations therefore miss a refused connection, while transactions misclassify bad configuration as an outage. This ticket includes the correction described by database-persistence ticket 36; that ticket is related work, not a prerequisite. Leave the source ticket unchanged when publishing this ticket.

Add an `isUnavailable(error)` predicate to the existing `SqlStore` interface, alongside its driver-specific duplicate-key predicate. Each adapter owns the knowledge needed to recognise its failures. The repository's existing naming operation asks the store only for otherwise unclassified failures, preserves already classified failures and their precedence, and wraps recognised failures with the original error as cause. A false predicate result means no evidence of unavailability; it does not assert permanence. Unavailability does not itself guarantee that retrying a write is safe.

PostgreSQL recognises the driver's connection errors, the existing unavailable SQLSTATE allowlist on normalised statement errors and raw acquisition errors, and an explicit justified allowlist of structured socket codes including ECONNREFUSED, ECONNRESET and ETIMEDOUT. Keep PostgreSQL policy in its adapter. Preserve bounded cause-chain traversal, including cycle protection. Unknown errors remain unclassified.

SQLite retains recognition of driver connection errors, including BUSY and LOCKED. Resolve closed-client recognition explicitly: the installed runtime throws a plain closed-client Error, and the existing proof closes the database directly. A flag set only by store.close cannot observe that case. Preserve direct-close behaviour with a narrowly contained and tested compatibility check for the pinned runtime's closed-client error, unless a structured signal is available; document that exception locally. Do not infer unavailability from all errors observed after closure or introduce a lifecycle redesign for this ticket.

Delete the repository's positional transaction classifier and its private forwarding method; transaction calls use the store directly. Do not wrap direct operations in transactions to obtain classification. Keep existing transaction, serialisation and conflict-reload semantics.

## Acceptance criteria

- [ ] Through the repository interface, a refused PostgreSQL connection raises PersistenceUnavailableError for listSpaces, loadSpace, loadMetaSpaceId and markExported, as well as transactional reads, commits and aggregate lifecycle operations. Preserve the original failure as cause.
- [ ] A commit that loses a revision race and then encounters an outage during its post-rollback reload is unavailable. Cover the corresponding Meta identity read used after an aggregate replacement conflict without nesting serialisation or reading through an aborted transaction.
- [ ] Store-interface tests cover normalised connection failures, normalised and raw unavailable SQLSTATEs, structured socket failures, wrapped causes and cyclic cause chains. Raw acquisition codes 53300 and 57P03 remain unavailable; 28P01, 28000 and 3D000, unrelated errors and unknown codes do not become unavailable.
- [ ] Reproduce at least one real PostgreSQL misconfiguration, such as an incorrect password, and record the error shape reaching the repository. Verify it stays unclassified through a transactional operation as well as a direct read.
- [ ] SQLite operations after the underlying database is closed directly retain the unavailable outcome on transactional and direct paths. Existing BUSY/LOCKED behaviour remains covered, and unrelated plain errors stay unclassified.
- [ ] HTTP proves a recognised direct-read outage is 503 persistence-unavailable and an unclassified configuration failure is 500 internal-error. Startup tests prove configuration failures count toward the existing confirming-failure limit and terminate retries, while recognised outages keep the existing outage retry behaviour.
- [ ] Already classified broken stored state retains precedence; existing unavailable failures are not redundantly wrapped. Repository classification no longer inspects driver fields or infers availability from callback progress.
- [ ] Update the existing unavailable-operation tests and explanatory comments to state the new rule, record any SQLite compatibility exception and the socket allowlist rationale, and pass the relevant repository, HTTP, startup and database integration checks plus normal verification.
