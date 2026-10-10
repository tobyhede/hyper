# 06: Move navigation and browser-history rules into their own guide

**What to build:** AGENTS.md's `app` package entry shrinks to its responsibility and its boundary. The navigation and browser-history rules move into a guide listed under "Agent skills", where an agent touching navigation finds them first. Those rules are: no router library; one module knows the browser exists; a Navigation call is never paired with a history write; how held traversals and entry numbering work.

**Blocked by:** 01.

**Status:** resolved

- [x] Every rule in today's `app` entry lands in the new guide or stays in AGENTS.md as a one-line invariant. Nothing is dropped.
- [x] Every claim about another module names the test that holds it.
- [x] Lineage ("went when", "used to") is removed. A history sentence that guards an invariant becomes that invariant in present tense.

## Answer

New guide `docs/agents/navigation.md`, listed under "Agent skills" as "Navigation & browser history". AGENTS.md's ADR 0069 "Decided" entry is now a pointer to it. Where each rule from the old `app` entry lives:

- No router library, the destination table in `@project/http`, the Node host resolving the same table → navigation.md, "Product addresses", with ADR 0069's URL shape (`compact-uuid.property.test.ts`, `product-destination.test.ts`).
- `browser-location.ts` the one module that knows the browser, `HistoryApi`, `createBrowserHistory`, `NativeBrowser`, `browserHistory()` in `space.ts`, `createSpaceStartup`'s default, `follow(app)`, `useAddressedResource`, `useSpaceAddresses` → navigation.md, "One module knows the browser exists". No test scans for a second `window` reader; the guide says so and gives the grep.
- `NavigationAddress`, `destinationSync`, `none`, the call-site comparison, `popstate` reporting → navigation.md, "A Navigation operation is never paired with a history write". "The five-diff shape ADR 0081 removed" became the present-tense reason.
- `PopStateAnswer`, late holds, `hyperHistoryIndex` → navigation.md, "Held traversals and entry numbering", each with its test (`browser-location.test.ts`, `browser-history.test.ts`, `image-resource.spec.ts`, `held-traversal.spec.ts`).
- `canvasProjection` → `rendering.md`, new bullet "`canvasProjection` is what the render adapter publishes" (`canvas-projection.test.ts`, `canvas-projection.property.test.ts`).
- `map-resolution.ts` → already `editing-and-persistence.md`, "Map resolution answers one authored Map".
- Continuation, `ContinuationControl`, no creation pane → already `ui.md`.
- Composition (`composeCore`, `composeApp`, Open Spaces the one caller), Zustand's owner, Navigation's state, Open/Closed on the Map → stay in AGENTS.md as one-line invariants under `app`.

"Went when", "no longer" and "removed" are gone from what moved.

Checks: the five doc/skill unit tests (129 passed); `pnpm exec prettier --check AGENTS.md docs/agents/*.md`. AGENTS.md 58,642 → 51,296 bytes, the new pointer included.
