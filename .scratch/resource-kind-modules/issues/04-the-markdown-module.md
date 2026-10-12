# 04 — Markdown is a module

Status: resolved

**What to build:** move the Markdown kind onto the registry from `02`, domain and view halves, and delete every `'markdown'` branch outside its module. Behaviour does not change.

**Depends on:** 02.

**Acceptance:** no non-test source outside the Markdown module names `'markdown'`, and CSS selectors on `data-kind='markdown'` or `data-content-kind='markdown'` move with the module's view half (ADR 0120); the E2E and Ladle specs that exercise Markdown Resources pass unchanged.

## Answer

Built. The Markdown kind is the third module:

- **Domain half:** `packages/core/src/kinds/markdown.ts` exports `markdownKind`, with the `content` schema moved out of `schema.ts`. Its flags are the ones every Resource had before a kind could set them (it can be Open, takes no Shape), and its content resolves through `markdownKind.resolveContent`.
- **View half:** `packages/ui/src/kinds/markdown.ts` holds the kind's names and its `MarkdownOperations`. No stylesheet selects on the Markdown kind, so there was no CSS to move.
- **Everything else** names the kind through `markdownKind.id`, and `test/unit/kind-ids-in-modules.test.ts` now scans for `'markdown'` too. The Markdown file body, which only this kind owns, is still read and written by `resource-file.ts` through `markdownKind.id`; `07` replaces that file format.
