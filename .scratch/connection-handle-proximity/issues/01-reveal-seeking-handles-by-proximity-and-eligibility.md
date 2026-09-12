# 01 — Reveal seeking handles by proximity and eligibility

**What to build:** During a connection or reconnect drag, seeking-end authoring handles
(targets for an ordinary connect, sources when a `from` endpoint is moved) become
visible only on Things that are both within proximity of the pointer and eligible
for the gesture under `edgeEligibility`. Anchors still render on every Thing
(ADR 0087); only the affordance reveal changes.

**Status:** resolved

**Decided:**

- Proximity is distance from the pointer to the Thing’s axis-aligned bounds in
  canvas coordinates; radius **R = 80**. Over the body the distance is 0.
- A Thing `edgeEligibility` refuses (e.g. `edge-already-exists`) shows no seeking
  handles — same as far away. `isValidConnection` remains the release gate.
- ADR 0090 records the proximity∩eligibility reveal and refines ADR 0033 /
  ADR 0087; `rendering.md`, tests and this ticket match it.

**Out of scope:** Changing snap `connectionRadius`, Alt/Option empty-drop, or
anchor geometry.

## Checklist

- [x] Pure proximity helper + `CONNECTION_TARGET_PROXIMITY = 80`
- [x] Eligibility context from Edge Authoring into `ThingNode`
- [x] CSS reveal only when seeking ∧ near ∧ eligible
- [x] Ineligible Things are not `isConnectableEnd` for the seeking role
- [x] Unit tests for proximity and reveal attributes
- [x] E2E: mid-drag only the near eligible Thing shows seeking handles
- [x] `rendering.md` matches
- [x] Connection e2es green; full `pnpm verify` blocked locally by untracked
      `.worktree/` (oxlint ignore is `.worktrees/` plural)

## Answer

Seeking-end reveal is `offersConnectionEnd({ seeking, near, eligible })`.

- Proximity: AABB distance ≤ 80 after converting `connection.pointer` from
  container to flow coordinates (`connectionPointerInFlow`). One store
  subscription in `ConnectionTargetProximityProvider` publishes near ids.
- Eligibility: `ConnectionEndEligibilityContext` from Edge Authoring’s draft +
  `accepts`. Refused targets also lose `isConnectableEnd`.
- `connectHandles` moves onto the target by coordinates before asserting opacity,
  because hidden handles keep `pointer-events: none`.
