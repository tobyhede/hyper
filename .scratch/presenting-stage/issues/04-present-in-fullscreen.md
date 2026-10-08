# 04: Present in fullscreen

**What to build:** Present takes the browser fullscreen when it can, and fullscreen and presenting end together.

**Blocked by:** 02 — Present on the Stage.

**Status:** ready-for-human

- [x] Present requests fullscreen on the whole document within the activation that starts presenting, so dialogs that portal to the end of the page stay visible over the Stage.
- [x] A refused request is tolerated silently, and the Stage fills the window regardless. A presentation opened from a link, which has no activation, does not request fullscreen.
- [x] While presenting that entered fullscreen, leaving fullscreen, including by the browser's own Escape, leaves presenting.
- [x] Leaving presenting any other way exits fullscreen if presenting entered it.
- [x] A presentation that never entered fullscreen is not ended by an unrelated fullscreen change.
- [x] e2e covers entering, leaving by each route and a refused request, against Chromium's fullscreen behaviour.
- [ ] `pnpm typecheck`, `pnpm typecheck:packages`, targeted lint and the affected unit and e2e specs pass locally; the draft PR's `CI passed` gate is observed green before resolution.

**Decisions taken:**

- **Coordinator.** `packages/app/src/presenting-fullscreen.ts` (`presentingFullscreen`) owns the pairing, over a `Fullscreen` interface and Navigation's presenting mode. Its `present` starts presenting and requests fullscreen synchronously in the same call, so the Dock's Present click is the activation. It records `entered` only when a fullscreen it requested comes on while presenting; only then does fullscreen ending end presenting, and presenting ending (Overview, Escape, Back, anything) exit fullscreen. A refusal clears the request, so a later fullscreen another script or the reader turns on is never adopted. A grant that arrives after presenting already ended is exited at once. `openPresentation` (a link) never asks.
- **Browser adapter and injection.** `packages/app/src/browser-fullscreen.ts` is the one module that touches the Fullscreen API; it requests on `document.documentElement` and answers every refusal (rejection, synchronous throw, missing API) as `false`. `main.tsx`, the composition root, names `document` and supplies it through `FullscreenContext` (`fullscreen-context.ts`); a mount with no provider (tests, Ladle) gets a host with no fullscreen, which presenting tolerates as a refusal. Threading it through `createOpenSpaces` was rejected as touching some thirty test call sites for a capability only the real browser has.
- **Dock.** `DockChromeInput` gains `present`, which `App` supplies from the coordinator; the Dock no longer calls `navigation.present` itself.
- **e2e and Chromium.** `presenting-fullscreen.spec.ts` runs against headless Chromium's real Fullscreen API: Present enters fullscreen on `<html>`; leaving fullscreen leaves presenting; Overview, Escape and Back each exit fullscreen; a refused request (stubbed `requestFullscreen`) leaves the Stage filling the viewport; a link-opened presentation does not request and survives an unrelated enter and exit. **Limit:** the browser's own Escape exit is browser UI that headless Chromium does not drive, so it is simulated by `document.exitFullscreen()`; Playwright's Escape press reaches the page and exercises the "leaving presenting exits fullscreen" path instead.
- **Existing spec.** `presenting.spec.ts`'s frame-geometry test resized the viewport while presenting, which Chromium refuses for a fullscreen window; it now leaves presenting and presents afresh at each size.
- **No UI component.** Nothing new is drawn, so no story, inventory entry or parity claim is added.

- **Verification.** The local half of the last criterion passes (typecheck, typecheck:packages, ui:catalog:check, targeted eslint and prettier, lint:anti-slop, `packages/app/test` and `test/unit`, and the presenting, presenting-fullscreen, space-routing, held-traversal, http-persistence, editing, image-resource, mobile-dock and new-space e2e specs). It stays unticked until the branch is pushed and `CI passed` is observed green.
