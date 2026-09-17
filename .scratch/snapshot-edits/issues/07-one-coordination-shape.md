# 07 — The coordination has one shape

Status: ready-for-agent
Blocked by: 05, 06

**What to build:** Delete the coordination's old `derive` shape, the `update` rebase closure and `completedSnapshot`, leaving `prepare`/`plan` as the only way a coordinated lifecycle operation runs. No behaviour changes. See `../spec.md`, "Coordinated operations decide after their last wait".

**Why:** After 04–06 no operation uses the old shape. Leaving it keeps a second way to write an operation that decides before its last wait, which is the defect 04–06 removed.

## Build

- [ ] No `derive` path, no `update` change carrying an `edit` closure, and no `completedSnapshot` remain in the registry. Recovery retries (`retry`, `keepLocal`) re-run through the same shape.
- [ ] The contract comment on the lifecycle change no longer describes a rebase.

## Done when

- [ ] Every registry and lifecycle test from 04–06 passes unchanged.
- [ ] `pnpm verify` is green. `pnpm e2e` and `pnpm e2e:ladle` are not applicable: nothing observable changes, and 04–06 each ran `e2e` on the behaviour.

## Comments
