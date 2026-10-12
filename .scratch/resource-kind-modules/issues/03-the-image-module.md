# 03 — Image is a module

Status: resolved

**What to build:** move the Image kind onto the registry from `02`, domain and view halves, and delete every `'image'` branch outside its module. Behaviour does not change.

**Depends on:** 02.

**Acceptance:** no non-test source outside the Image module names `'image'`, and CSS selectors on `data-kind='image'` or `data-content-kind='image'` move with the module's view half (ADR 0120); the E2E and Ladle specs that exercise Image Resources pass unchanged.

## Answer

Built. The Image kind is the second module:

- **Domain half:** `packages/core/src/kinds/image.ts` exports `imageKind`, with the URL rule, the stored-image id and the `content` schema moved out of `schema.ts`. Its flags are the ones every Resource had before a kind could set them (it can be Open, takes no Shape), and its content resolves through `imageKind.resolveContent`.
- **View half:** `packages/ui/src/kinds/image.ts` holds the kind's names and its `ImageOperations`; the rail offers Replace, rather than Edit, where `isImageOperations` holds. No stylesheet selects on the Image kind, so there was no CSS to move.
- **Everything else** names the kind through `imageKind.id`, and `test/unit/kind-ids-in-modules.test.ts` now scans for `'image'` as well as `'ur'`.
