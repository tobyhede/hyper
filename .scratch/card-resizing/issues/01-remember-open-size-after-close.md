# 01 — Remember Open Size after Close

**What to build:** Replace the coupled Expanded geometry with explicit Open or
Closed state and a remembered Open Size throughout the stored Space. An author
can resize a Card, Close it, reload the Space, and reopen it at the same size;
Cards never Opened acquire the concrete default Open Size on first Open. Closed
Size remains fixed domain policy and is not repeated in stored Placement data.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] A Placement entry is a discriminated Open or Closed value: Open requires
      an Open Size, Closed may retain one, and Closed Size is structural rather
      than stored or optional document data.
- [x] Open, Close, Resize, equality, conversion, displacement and effective-size
      derivation all speak the new model without a second compatibility path for
      the retired Expanded shape.
- [x] First Open stores the concrete default Open Size; Close preserves it; an
      ordinary Resize changes it; reopening restores it.
- [x] Every tracked seed, fixture, document example and test is rolled forward.
      Intake rejects the retired shape rather than normalizing it.
- [x] The behavior survives the HTTP persistence boundary and browser reload,
      with focused unit and application evidence for never-opened, Open, and
      Closed-with-remembered-size Cards.
- [x] Proposed ADR 0066 and the current glossary agree with the implemented
      model; do not accept the ADR yet while its resize interaction remains
      incomplete.
- [x] `pnpm verify` and `pnpm e2e` pass, with the real output recorded.

## Answer

Built across three commits on `feat/card-resizing`, with one pre-existing defect fixed first:

- `434999d` fixes the pre-existing `pnpm verify` failure on the branch: `APP_UI_IMPLEMENTATION_PATTERN` was missing the `!@project/ui/MarkdownSourceEditor` negation that AGENTS.md and `ui-import-restrictions.test.ts` both state.
- `f174cbb` is the vocabulary rename alone (per `docs/agents/workflow.md`): `CLOSED_CARD_SIZE`, `DEFAULT_OPEN_CARD_SIZE`, refusal code `card-not-open`, node-data `open`, `openCardIds`, and the `data-open` DOM attribute and CSS selectors. The stored `expanded` field was deliberately untouched here.
- `b95cc8f` is the structural change. `cardPlacementSchema` is a strict discriminated union on `state`: `{x, y, state: 'closed', openSize?}` | `{x, y, state: 'open', openSize}`. `state` is required with no hand-authoring default — a defaulted key would give one fact two document shapes, the ground ADR 0066 rejected an optional stored Closed Size on. Strictness is what rejects the retired `expanded` key; nothing was added to `documentRefusal` (ADR 0056). `Placement.effectiveSize` is the one rect operation (a Closed Card remembering an Open Size measures Closed); `drawn`/`authoredPoint` displace only for Open entries; conversion (`fromLayoutStrategyGraph`) and the renderer's report (`placementFromNodes`) claim `closed` honestly, since `next` reads state only from the authored side and an admitted Card is never-Opened. Authoring: first Open stores `DEFAULT_OPEN_CARD_SIZE`, Close preserves `openSize`, reopen restores it, Resize on a Closed Card refuses `card-not-open`. Both tracked space files (17 entries), the canonical exporter (`src/export/export-space.ts`, canonical key order), seeds and ~50 test files rolled forward in the same change.

Evidence: schema-shape tests in `packages/core/test/schema.test.ts`; intake rejection/acceptance in `packages/graph/test/space-intake.test.ts`; `Placement` operations incl. `effectiveSize` and closed-with-remembered-displaces-nothing in `placement.test.ts`; the authoring lifecycle (first-Open default, resize 700×500 → Close → reopen restores) in `space-authoring-operations.test.ts`; a memory-backend round trip of never-Opened, Open, and Closed-with-remembered entries in `memory-backend.test.ts`; and the extended e2e `'resizing an open Card persists its authored rect through reload'`, which now also Closes, reloads, reopens and asserts the remembered rect over the HTTP boundary.

Real output recorded at resolution: `pnpm verify` — 155 test files, 1729 passed, 8 skipped, exit 0. `pnpm e2e` — 112 passed. `pnpm e2e:ladle` — 47 passed (one unrelated local flake of `card-expand.spec.ts:14` on a single run did not reproduce across two full re-runs; local runs use `retries: 0` by design).

ADR 0066 is untouched and stays `proposed`: its stored-model half agrees with the implementation as written, and its resize-interaction half (one control, canvas draft, snap-to-Close) is issues `02`–`04`.
