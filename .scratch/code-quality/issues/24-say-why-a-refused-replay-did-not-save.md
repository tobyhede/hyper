# 24: Say why a refused replay did not save

**Status:** needs-triage

**Blocked by:** None; follows 23

**Problem:** A coordinated recovery's replay can now be refused before it reaches the backend: `planReplay` answers `persistence-recovery-required` when one of its participants needs recovery under another coordination (23). `createSpaceSessionRegistry`'s `replay` discards that answer (`void coordinate(...).catch(() => undefined)` in `session-registry.ts`), so nothing tells the author why their Edit did not save.

## Sequence

1. C0 creates a Space Resource for TARGET in Meta and is answered `permanent-failure`. Meta and TARGET are `rejected` and hold C0's recovery.
2. C1 creates a Space Resource for CHILD in TARGET and is answered `conflict`. TARGET and CHILD are `conflicted` under C1.
3. The author edits Meta. `submit` installs the Edit in `working` and calls C0's `retry`. The replay is refused because TARGET needs C1's recovery. C0 returns to its earlier phase.

**Observed:** Meta still shows C0's original `forbidden` rejection. Its newest `working` is unsaved, and nothing names TARGET as the Space to resolve first. Resolving C1 does not re-run Meta's replay, so Meta's Edits are persisted only after one more Edit.

A replay refused by a failed aggregate read is also dropped this way (14). After 23, an ordinary sequence can reach this path too.

## To decide

- Whether the refusal becomes part of the requesting participant's persistence state, for example a `refused` carrying `persistence-recovery-required` and the blocking Space, or is reported some other way.
- Whether resolving the blocking coordination should re-run a replay that was refused.

## Acceptance

- A test drives the sequence above and asserts that Meta's state names TARGET as the Space that must recover first.
- The chosen answer to re-running is written down and tested.
