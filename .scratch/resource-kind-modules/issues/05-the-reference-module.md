# 05 — Reference is a module, and the core enforces Targets from declared references

Status: resolved

**What to build:** move the Reference kind onto the registry. Its module declares one outgoing Resource reference, its Target, and the flag that it may not itself be a Target. The core's intake replaces the hand-written Reference checks in `packages/graph` with a generic rule: every declared Resource reference resolves, and to a kind that may be a Target, which keeps referencing a single hop (ADR 0113). Content resolution (`content-resolution.ts`) asks the Target's module for its content rather than matching on kinds.

**Depends on:** 02, and 03 and 04 so every Target kind is a module.

**Acceptance:** the existing refusals for a dangling Target and a Reference-to-Reference keep their codes and wording; no non-test source outside the Reference module names `'reference'`, and CSS selectors on `data-kind='reference'` or `data-content-kind='reference'` move with the module's view half (ADR 0120).

## Answer

Built. The Reference kind is the fourth module:

- **Domain half:** `packages/core/src/kinds/reference.ts` exports `referenceKind`, a `TargetingKindModule` (`kind-module.ts`): its content schema, its flags (`mayBeTarget: false`, the new flag every other kind sets true), the Resource references its content declares (its Target) and the Target whose content it shows. A kind that owns its content is now a `ContentOwnerKindModule`, which adds the content facts and `resolveContent`; the UUID schema moved to `packages/core/src/uuid.ts` so a kind module can use it without importing `schema.ts`.
- **The core's rules read declarations:** `resourceReferences`, `contentTarget` and `mayBeTarget` (`packages/core/src/kinds/registry.ts`). Intake's check in `packages/graph/src/validate.ts`, the Reference checks on create and delete in `snapshot-edits.ts`, and content resolution in `content-resolution.ts` use them, so none matches on the Reference kind. The refusal codes and wording are unchanged.
- **View half:** `packages/ui/src/kinds/reference.ts` holds the kind's name and its `ReferenceOperations`; its frame is `reference-canvas.css` beside it, moved out of `canvas-resource.css`.
- **Everything else** names the kind through `referenceKind.id`, and the kind-id scan now covers `'reference'`. `ContentVia` is `'self' | ReferenceKindId`: content reached through a Reference Resource says so by that kind's id.

One part is not built as written: `resourceReferences` and `contentTarget` in the registry still pick the Reference kind out of the closed Resource union, because `content` is typed per kind (`02`'s Answer) and TypeScript cannot call a module looked up by id with its own content without an assertion. They are the one place that match, and they sit in the registry.

**Since (2026-10-13):** issue `10` made intake's reference messages kind-neutral (the codes are kept), so "wording unchanged" no longer holds. `content-resolution.ts` is gone: resolution is in `packages/core/src/kinds/registry.ts`, whose correlated `Kinded<K>` helpers call each module with its own content, so the "not built as written" paragraph is retired.
