# 06 — Space is a module, and the core enforces Space lifetime from declared references

Status: resolved

**What to build:** move the Space kind onto the registry. Its module declares one outgoing Space reference with the owns-lifetime flag. The core enforces, generically from declared Space references: no cycle, a Space lives while a reference holds it and is deleted with its last (ADR 0074), and every ordinary Space is reached from the Meta Space. The module's own narrow check is that its Map and Graph resolve in its target Space; it re-implements no aggregate rule.

`packages/persistence/src/space-resource-planning.ts` and the SQL repository's Space Resource comparisons (`src/persistence/sql-space-repository.ts`) read declared references rather than `kind === 'space'`.

**Depends on:** 02, 05.

**Acceptance:** the existing aggregate refusals keep their codes; no non-test source outside a module names a kind id, which `test/unit/kind-ids-in-modules.test.ts` holds once every kind is in its list. CSS selectors on a kind's `data-kind` or `data-content-kind` belong to that module's view half (ADR 0120) and move with it rather than being exempted.

## Answer

Built. The Space kind is the fifth and last module:

- **Domain half:** `packages/core/src/kinds/space.ts` exports `spaceKind`, a `SpaceReferencingKindModule`: its content schema and `SpaceView`, moved out of `schema.ts` and `resource-content.ts`; its flags, including the new `ownsReferencedSpaces` (true here, false on every other kind); its Space references (its target); and `selectionProblem`, its one narrow check that its Map and Graph resolve in the target and the Graph is the Map's.
- **The core's rules read declarations:** `spaceReferences`, `lifetimeSpaceReferences` and `spaceSelectionProblem` in `packages/core/src/kinds/registry.ts`. Aggregate intake (`packages/graph/src/space-aggregate.ts`: missing target, the selection check, cycles, rooting) and the single-Space self-reference check in `validate.ts` use them; the deletion cascade in `packages/persistence/src/space-resource-planning.ts` counts lifetime references. The refusal codes are unchanged.
- **View half:** `packages/ui/src/kinds/space.ts` holds the kind's names and its `SpaceOperations`; its frame is `space-canvas.css` beside it, moved out of `canvas-resource.css`.
- **The scan covers every kind.** `'space'` also tags a Space itself (an entity, a product destination, a Resources-list row, a drag, an icon), so `kind-ids-in-modules.test.ts` counts those per file rather than exempting a selector or a file.
- A kind no module registers is refused at intake, so the core's rules take only a registered kind.

Not built as written: the Space Resource's selection (its `map`, `graph` and `framing`) is still read by kind in the planning code, the canvas and the SQL repository's structural comparison (`src/persistence/sql-space-repository.ts`), through `spaceKind.id`. Those read the selection, which is the Space kind's own content rather than a declared reference, and moving them behind the module is a refactor this ticket does not ask for. Ticket 08's scan counts them by file under the Space Resource lifecycle, but they compare the selection, not lifetime; issue 10 records them as unbuilt (candidate F).
