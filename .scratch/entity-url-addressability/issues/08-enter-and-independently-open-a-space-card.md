# 08 — Open, enter and independently address a Space Card

**What to build:** A viewer can open a Space Card in place, enter its Space with
the complete working surface, move safely among open Spaces, close an ordinary
context, or open the target independently at its canonical URL.

**Blocked by:** `space-cards/10` — Extend the fixture to linked Spaces;
`space-cards/11` — Enter a Space Card, and Open Spaces carries the session,
which owns the Enter surface (`space-cards/01`'s Deferred section hands it
there). `v1-release/01` was here and is now `resolved`.

**Status:** ready-for-agent
Tags: release/v1

- [x] Opening in place draws the target through the context the Card supplies and
      leaves the target Space's own active selections untouched.
      `packages/app/src/components/SpaceCanvas.tsx:349-351` builds each embed
      request from the Card's own `spaceId`, `layout` and `graph`, and
      `packages/app/src/embedded-authoring.ts:42` routes the embedded surface's
      completions into `completeInLayout` against that Card-supplied Layout id,
      never against the target's navigation state.
- [x] Enter shows the target as the Space being worked in, with its complete
      command surface and editing capabilities. Built by `space-cards/11`:
      `App` is the production caller of `OpenSpaces.enter`, spent from the
      Space Thing rail's `Enter Space` kind command.
- [x] Enter loads the target from repository state already accepted by complete
      aggregate intake. Navigation performs no second cycle check and does not
      carry an ancestor chain as an integrity mechanism. Exercised by
      `space-cards/11`: `App` calls `OpenSpaces.enter(spaceId, diagram)` from
      the Space Thing rail; Graph is activated only when the entry is new.
- [ ] Enter resolves the stored context `layout-only-v1/04` owns rather than
      restating it here; this ticket owns the Enter surface, not the selection
      or its write-back rule. **Still open on write-back**: `layout-only-v1/04`
      (now `entity-url-addressability/07` / ADR 0079 Ticket 04) made the
      selection durable on the Thing; `space-cards/11` seeds a *new* entry from
      it and leaves an already-open entry's live selection alone. Persisting
      the live selection back onto the Thing is not this cut-over.
- [x] Entering an already-open Space reuses its live context. An author can move
      among open Spaces without losing work, close an ordinary context
      explicitly, and never close the Meta Space.
  - [x] Reusing an already-open entry on Enter — `packages/app/test/enter-space-thing.test.tsx`
        holds that a second Enter keeps the live Diagram rather than the Card's.
  - [x] Closing an ordinary context explicitly — `ExitSpaceControl` calls
        `spaces.exit` at
        `packages/app/src/components/ExitSpaceControl.tsx:34`, mounted at
        `packages/app/src/App.tsx:920-921`.
  - [x] Never closing the Meta Space — `ExitSpaceResult`'s
        `meta-space-permanent` refusal
        (`packages/app/src/open-spaces.ts:66-77`) is returned at `:552` and
        presented as "Meta cannot be closed." by `ExitSpaceControl.tsx:41-42`.
- [ ] Opening independently uses the target Space's canonical address and
      carries no containing navigation or presentation state. **Half-built.**
      `packages/app/src/entity-actions.tsx:142-168` offers Copy link for a Space
      entity, on the Space's own address and deliberately not the drawing
      Layout's. Nothing offers it *from a Space Card*: the Card arm of the same
      module (`:233-272`) copies the Card's own `layout-card` or `card`
      destination, which is the containing address rather than the target's.
- [x] Browser Back, Forward and reload reproduce addressable transitions without
      producing an Edit. `packages/app/src/browser-location.ts` decides
      `push | replace | none` from a pure comparison against what the current
      pathname resolves to, so a redundant notification decides nothing;
      `packages/app/test/browser-location.test.ts` proves it against a
      recording `HistoryApi` in the node environment (it writes nothing when it
      begins following, writes nothing when the same position is decided twice,
      and restores a Back onto a resolvable Card location without earning an
      entry).
- [x] Persistence waiting, refusal and warning behavior is supplied and proven
      by `architecture-review/14`; its presentation and control placement remain
      UX work. The supplier is `resolved`; the presentation is
      `ExitSpaceControl`'s and stays open as UX with `space-cards/11` and
      `space-cards/12`.
- [ ] Application and Ladle evidence prove the chosen current UX without making
      that treatment an architectural constraint.

## Deferred

Cross-Space Edges, cross-Space traversal and presentation-point deep links are
outside V1.

## Comments

### 2026-09-09 — Blocker list corrected in both directions, and the open work named

Removed as resolved, each verified: `07 — Author a Space Card reference`
(`**Status:** resolved`), `space-cards/01 — Open and edit a Space Card in place`
(`**Status:** resolved — the selected target Layout is editable through its
shared session`), and `architecture-review/14 — Deepen Open Spaces composition`
(`Status: resolved`). Kept: `v1-release/01` (`ready-for-human`) and
`space-cards/10` (`ready-for-agent`). Added `space-cards/11`, which owns the
Enter command this ticket's second and fourth criteria depend on —
`space-cards/01`'s Deferred section says so in as many words: "Enter's full
command-surface semantics remain issue 11."

The genuinely open work, so the next reader does not re-derive it:

- **Enter has no surface.** `OpenSpaces.enter` is composed and tested but called
  from no production module, so criteria 2 and 4 have nothing to observe.
- **Copy link is half there.** A Space entity offers it; a Space Card offers no
  route to its target's canonical address.
- Criterion 3's rule is already what the merged code does, and the contradicting
  criterion in `space-cards/11` was deleted rather than reconciled — the cycle
  protection lives in aggregate intake
  (`packages/graph/src/space-aggregate.ts:44` and `:203`,
  `packages/graph/src/validate.ts:281`) with a render-time guard at
  `packages/app/src/components/SpaceCanvas.tsx:331-332`.
