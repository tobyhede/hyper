# 04 — A Space Thing deletion refuses when an Alias arrives during its wait

Status: ready-for-agent
Blocked by: none

**What to build:** Give the registry's lifecycle coordination the `prepare`/`plan` shape beside the existing `derive` shape, and move Space Thing deletion onto it. Deleting a Space Thing decides its rules and its cross-Space cascade from the Spaces as they stand after the coordination's last wait, and a refusal from that decision is answered as a value. See `../spec.md`, "Coordinated operations decide after their last wait".

**Why:** Today deletion checks in `derive`, waits on the aggregate read, then re-applies a closure to a working snapshot an Edit may have changed during the wait. When an Alias of the Space Thing lands in that window, the re-applied `deleteFromSpace` refuses and `completedSnapshot` throws, so `delete()` rejects instead of telling the author the Thing still has Aliases.

## Red first

- [ ] **Already written and red:** `refuses to delete a Space Thing an Alias came to target while the deletion was reading persistence` in the registry tests. It rejects today with `Space Thing deletion through SnapshotEdit answered 'refused'`.
- [ ] **The cascade is planned late too.** A Space Thing reference to the target Space, added in another Space during the same wait, keeps the target Space from being deleted. Write it failing first; if it will not fail, strike it here and say why in Comments.

## Build

- [ ] The coordination accepts an operation as `prepare` (async: every wait, including the aggregate read deletion needs) and `plan` (synchronous: reads the current Spaces, answers changes or a refusal). The coordination performs its own aggregate read before `plan`, and nothing suspends between `plan` and installing its result. `plan`'s type does not admit a Promise.
- [ ] A refusal from `plan` is installed and answered by the coordination as a value, beside `aggregate-refused` and `persistence-read-failed`.
- [ ] Space Thing deletion runs `SnapshotEdit.deleteFromSpace` and computes the target-Space cascade inside `plan`. Checks left in `prepare` are early exits only.
- [ ] The old `derive` shape stays for create, link, `deleteDiagram` and `deleteGraph` until 05, 06 and 07.

## Done when

- [ ] Both red tests pass; the delete-after-Alias test also asserts the containing Space still holds the Space Thing and the Alias, and that the Alias Edit commits once the coordination ends.
- [ ] `pnpm verify` is green. `pnpm e2e` is run because Space Thing deletion is canvas-visible. `pnpm e2e:ladle` is not applicable unless a story changes.

## Comments
