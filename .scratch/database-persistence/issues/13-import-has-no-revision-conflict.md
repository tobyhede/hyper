# 13 — Import has no revision conflict, and the type should say so

**What to build:** Decide whether `RepositoryImportResult` keeps a `conflict` variant that `PostgresSpaceRepository` can no longer produce, and remove the CLI's "Revision conflict" diagnostic if not.

**Status:** resolved

**Why:** Insert-only import compares no revisions, so no outcome of `importSpaces` is a revision conflict. The last producer was the space primary-key violation path, which now rejects with `duplicate-identity` instead — it had to, because classifying "the id existed before I began" apart from "a rival created it while I ran" is not well-defined under PostgreSQL's default READ COMMITTED isolation, and the attempt made identical inputs return different results depending on commit timing.

`RepositoryCommitResult.conflict` is untouched and stays. That one is real: `commitSpace` performs a genuine optimistic revision check, and its conflict carries the current stored aggregate so a caller can reconcile. Only the *import* variant is in question.

Currently unreachable from the only production implementation, but still typed and still tested:

- `src/persistence/space-repository.ts:25` — the variant
- `src/import/import-space.ts:9,24-29` — `'revision-conflict'` kind and the mapping
- `src/cli/run.ts:29` — the `Revision conflict` label
- `test/unit/import-space.test.ts:154,265` and `test/unit/hyper-cli.test.ts:227,260` — four cases exercising it through repository doubles

**The decision:** whether `SpaceRepository` is a contract several implementations may satisfy differently — in which case defensive handling of a conflict the PostgreSQL adapter never returns is reasonable — or the description of one implementation, in which case the variant, its mapping, its CLI label and those four test cases should all go.

- [x] The decision is recorded. `SpaceRepository` describes one implementation, there is no consumer outside this repository, and the variant is removed rather than kept as defensive handling.
- [x] Removed together: the variant, `'revision-conflict'`, the CLI's `Revision conflict` label, and the four test cases exercising them. No test asserts a result the production repository cannot return.
- [x] A doc comment on `RepositoryImportResult` records why import has no conflict variant while `RepositoryCommitResult` keeps one, so the absence reads as a decision rather than an omission.

## Answer

Removed. Import is insert-only and compares no revisions, so it has no conflict to report; `RepositoryCommitResult.conflict` is untouched because `commitSpace` performs a genuine optimistic revision check and its `current` is what a caller reconciles against.

Removing the variant also collapsed five `result.kind === 'rejected' ? result.message : 'Import conflicted'` guards in the integration suite to `result.message` — with two variants, `@typescript-eslint/no-unnecessary-condition` correctly rejects the ternary as always-true. Worth noting as evidence the variant was carrying weight in test code without carrying meaning.
