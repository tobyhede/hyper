# 06 — Batch import and dangerous truncation

**What to build:** Extend import to a directory containing multiple immediate child spaces and provide an explicit all-or-nothing database reset mode through `--dangerous-truncate`.

**Blocked by:** 05 — Single-space CLI import.

**Status:** resolved

- [x] A directory without its own `space.json` imports each immediate child directory that contains one, without deeper recursion.
- [x] The entire batch is discovered, parsed, identity-checked, and validated as one operation.
- [x] Ordinary batch import inserts complete, self-contained new Spaces, rejects existing identities, and never updates, merges, fills omissions from or deletes stored content.
- [x] `--dangerous-truncate` is rejected when no import path is supplied.
- [x] Dangerous truncation deletes every Hyper card and space before importing, inside the same transaction as the complete batch.
- [x] Any error rolls back both truncation and every import in the batch.
- [x] CLI output clearly distinguishes discovery, parsing, identity, domain-validation, database, and revision-conflict failures.
- [x] Integration tests prove preservation without the flag, total replacement with the flag, and complete rollback on failures after truncation begins.

## Answer

Implemented deterministic, non-recursive collection discovery and complete
batch parsing before the repository is called. Every imported Space supplies
its complete aggregate; no stored Space contributes omitted content or resolves
its references. Ordinary imports explicitly use insert mode; the CLI exposes
destructive replacement only through
`--dangerous-truncate`, rejects that flag without an import path, and reports
every imported stored identity and revision.

`SpaceRepository.importSpaces` now accepts an `ImportMode`. PostgreSQL performs
dangerous truncation, missing-id allocation, domain validation, and every batch
write inside one callback transaction, so a later validation or database
failure restores all prior Hyper content. Integration coverage proves insertion,
identity-collision rollback, total replacement, and rollback after truncation
and earlier batch writes have already occurred. Actual workspace opening and
selection are left at the startup seam owned by issue 07, as agreed for this
increment.

## Comments

**Superseded on 2026-07-30, after closure.** The criterion "CLI output clearly
distinguishes discovery, parsing, identity, domain-validation, database, and
revision-conflict failures" no longer holds in its last term, and is left ticked
because it was met at closure.

`hyper` can no longer report a revision conflict, because import cannot produce
one. Insert-only import runs no optimistic revision check, so a space id that is
already taken is an identity failure — it previously surfaced as a primary-key
violation classified `conflict` and printed as "Revision conflict", which named a
concurrency failure that cannot occur and hid the real cause. The remaining
classifications (discovery, parsing, identity, domain-validation, database) are
unchanged. See issue `13`.

The closing note's "missing-id allocation" is also retired vocabulary: ids are
**minted**, in process, and PostgreSQL is not a source of identity beyond the
`spaces.id` column default. See issue `11`.
