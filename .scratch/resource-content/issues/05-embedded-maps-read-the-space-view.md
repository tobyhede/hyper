# 05: Embedded Maps read the Space view

**What to build:** Discovering the Maps an Open Space Resource embeds, and the canvas code that frames them, read the Space view from the display rather than a separate node field, and take read-only-ness from `via`. The body-height report that clips an embedded Map attaches by the Resource's kind (a Space Resource or a Reference Resource), as it attaches today even while Closed, so an embedded Map is clipped correctly on the first frame after it Opens.

**Blocked by:** 03

**Status:** resolved

- [x] An Open Space Resource, and an Open Reference Resource to one (read-only), embed their Map exactly as before.
- [x] A discovery test: a Space Resource that goes from Closed to Open has its body height on the first request.
- [x] The existing embedded-map application proofs, including their clipping assertions, pass.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Comments

**2026-09-29** — Built. `spaceViewOf(display)` in `packages/ui/src/resource-display.ts` is exported from `@project/ui`. For an `open` or `presented` display showing a Space it returns `{ view, via }`. For any other display it returns `undefined`: `closed`, `editing` and `replacing` never carry a Space.

`discoverEmbeddedOpenSpaceResources` now reads the Space view through `spaceViewOf`. It takes read-only-ness from `via === 'reference'`, no longer from `data.kind === 'reference'`. `SpaceCanvas`'s two framing reads (the portal gesture's `framingOf` and the `EmbeddedMap` `framing` prop) also go through `spaceViewOf(…)?.view.framing`.

The body-height report is now keyed by `reportsBodyHeight(node)` in `embedded-open-space-resource.ts`, which checks `kind === 'space' || kind === 'reference'`. A Closed display carries no content, so kind is the only thing a Closed node knows that says it may draw a Space. Keying by kind keeps the old timing: the reporter is attached while the Resource is Closed, so the footer height is already in `bodyHeights` on the commit that Opens it. The old `spaceContent` would have been an exact test, but ticket 06 deletes it, so nothing new reads it. The cost is a ResizeObserver on each Reference Resource whose Target is Markdown or an image.

Evidence:
- `packages/ui/test/resource-display.test.ts` covers `spaceViewOf`: all four open/presented × self/reference cases, plus a property over every display.
- `packages/app/test/embedded-open-space-resource.test.ts`, "the body height an embedding is clipped by":
  - a height measured while Closed bounds the first request after Open, with a bottom of 456 where the reserved footer would give 396
  - a Closed Reference Resource reports
  - Markdown and image Resources do not report
- The discovery fixtures no longer carry `spaceContent`, so every discovery test now reads the display. The existing "marks a Reference Resource embedding… read-only" case now gets its read-only-ness from `via: 'reference'`.

`spaceContent` is still populated by the projection, and ticket 06 deletes it. No source reads it now. Only the fixture in `packages/app/test/use-embedded-open-space-resources.test.ts` still sets it.
