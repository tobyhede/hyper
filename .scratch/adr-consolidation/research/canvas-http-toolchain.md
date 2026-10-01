# Cluster: canvas-http-toolchain

The ADRs in this cluster are canvas/camera (0024 0027 0033 0043 0044 0090 0091), HTTP/addresses (0034 0069 0081) and toolchain (0061 0062 0071), plus superseded 0008.
Word counts come from mech.json. The class percentages are estimates from reading each paragraph, rounded to 5. Code facts marked "checked" were grepped in this session.

| ADR | words | LIVE% | STALE-VOCAB% | OVERTAKEN% | HISTORY% | #live | verdict | where rule lives now |
|---|---|---|---|---|---|---|---|---|
| 0008 | 641 | 0 | 0 | 70 | 30 | 0 | ALREADY-SUPERSEDED | nowhere (0024). The "core/graph framework-free" clause lives in AGENTS.md hard rules |
| 0024 | 805 | 20 | 10 | 10 | 60 | 4 | CONSOLIDATE | rendering.md Camera bullet ("no isLinear"), CONTEXT.md Presenting |
| 0027 | 1272 | 20 | 10 | 15 | 55 | 6 | CONSOLIDATE | rendering.md Camera; `cameras.tsx`, `presenting-keys.ts`, `PresentingChrome.tsx`, styles.css comment |
| 0043 | 635 | 45 | 0 | 5 | 50 | 3 | KEEP (fully restated in rendering.md) | rendering.md Camera bullet 1 (near-verbatim) |
| 0044 | 694 | 30 | 5 | 0 | 65 | 3 | CONSOLIDATE | rendering.md Camera bullets 2–3; `PresentingCamera`, `camera.ts` MAX_ZOOM |
| 0033 | 452 | 35 | 20 | 25 | 20 | 5 | CONSOLIDATE | rendering.md Edge Authoring bullet 1 |
| 0090 | 294 | 85 | 10 | 0 | 5 | 3 | KEEP | rendering.md; `connection-target-reveal.ts` (`CONNECTION_TARGET_PROXIMITY = 80`) |
| 0091 | 83 | 85 | 15 | 0 | 0 | 2 | KEEP | `persistence/src/space-resource-planning.ts` (`resetFraming`), `session-registry.test.ts`; no agents doc |
| 0034 | 269 | 70 | 0 | 5 | 25 | 4 | KEEP | http.md bullet 1 |
| 0069 | 605 | 35 | 15 | 30 | 20 | 8 | CONSOLIDATE | AGENTS.md "ADR 0069/0072" entry; `http/src/product-destination.ts`, `core/src/compact-uuid.ts`; not in http.md |
| 0081 | 932 | 35 | 15 | 5 | 45 | 5 | CONSOLIDATE | AGENTS.md `app` paragraph (browser-location, destinationSync); `navigation.ts`, `browser-location.ts`, `space.ts` |
| 0061 | 809 | 65 | 0 | 0 | 35 | 5 | KEEP | AGENTS.md (twice); `scripts/check-typescript-toolchain.ts`; `patches/@ladle__react@5.1.1.patch` |
| 0062 | 1163 | 45 | 0 | 5 | 50 | 5 | KEEP | AGENTS.md; anti-slop.md; `test/unit/assertion-ratchet.test.ts` (CEILING 47/25) |
| 0071 | 332 | 65 | 0 | 5 | 30 | 4 | KEEP | `tsconfig.base.json` lib/target, `.node-version`, ci.yml comments; no agents doc |
| **Total** | **8986** | ~35 | ~7 | ~12 | ~46 | 57 | | |

(The totals are word-weighted approximations.)

## Per-ADR live decisions (current vocabulary)

**0008**: none. Superseded by 0024. reveal.js is not a dependency (checked, there is no `reveal` in any package.json).

**0024**
1. Presenting is traversing the Active Graph's Edges from the Active Resource. There is no deck, slide sequence or presentation framework.
2. A linear Graph is not a special case: there is no `isLinear` flag or branch (checked, there is none in the source).
3. A merge revisited by traversal is a walk, not a duplicate. There is nothing to linearize.
4. Any future presentation framework must have a spatial-canvas model, not a sequence model.
Also still live: the presenting frame uses container-query units rather than `transform: scale()` for text, per the styles.css `.rf-resource-node__content` comment (checked).

**0027**
1. Presenting draws on the same canvas, closer in. There is no second surface or coordinate system, and nothing a Resource is transformed into.
2. A fork is chrome, not canvas: screen-fixed `PresentingChrome` enumerates the outgoing Edges.
3. Up/Down select among outgoing Edges without moving, Right commits and Left walks back (checked in `presenting-keys.ts`).
4. Back reads the Traversal history, not the Graph.
5. While presenting, the active Resource draws its full rendered content (`ResourceNode`).
6. "Slide" must not become a domain term. The camera scaling the presenting canvas is an accepted cost.

**0043**
1. Camera Promises are never awaited or `.then`-chained. Follow-up work goes on a timer the issuing effect cancels.
2. Camera calls are never `.catch`-contained. Plain `void` is deliberate.
3. The facts are pinned to @xyflow 12.11.2 and must be re-read when the pin moves.

**0044**
1. The presenting move is one `fitView({nodes:[{id}], padding, duration})`, with no two-phase move and no camera arithmetic.
2. If motion reads badly, the lever is `ease`/`interpolate`, never a second command.
3. `maxZoom` must cover the presenting zoom (`MAX_ZOOM = 16`, checked).

**0033**
1. Edges are drawn from four spatial handles, one per side. They are Graph-independent and coloured as the Active Graph, which is the write target.
2. Source handles show on a hovered or selected Resource.
3. The chosen side is interaction geometry. Only `{from,to}` is stored.
4. A drop on empty canvas cancels. Option/Alt-drop previews and then atomically creates a Markdown Resource plus its placement plus the Edge.
5. On success the target is selected so the author can keep drawing. Self-edges are legal.

**0090**
1. Seeking-end handles reveal only on Resources within 80 canvas units of the pointer (distance to AABB) and eligible under `edgeEligibility`.
2. An ineligible Resource is not `isConnectableEnd`, so there is no snap.
3. `isValidConnection` remains the release gate. Anchors still render everywhere (0087).

**0091**
1. Deleting a Map or Graph atomically rewrites every Space Resource that selected it, in the same Edit. A dangling selection is never left for read-time fallback.
2. Deleting a Map resets to the target's resulting selected Map and its Active Graph and clears framing. Deleting a Graph uses the surviving Graph and keeps framing.

**0034**
1. `@project/http` is a Hono application with the Fetch interface. It exports its inferred route type for the typed client, and runtime schemas still validate the wire.
2. The route module has no `node:` or Vite imports (checked). Hosts are adapters.
3. Assets, process lifecycle, WebSockets, logs and rate-limit storage belong to hosts, not the route module.
4. A runtime is supported only with a tested adapter plus compatible persistence.

**0069** (with 0079 applied)
1. Every Space, Resource, Graph and Map has a durable product URL built from its Id. Titles never participate.
2. The URL form is an unpadded 22-char base64url UUID. It is browser-route only: the domain, storage, HTTP and export use canonical UUIDs. There is one representation and no version segment.
3. Routes: `/spaces/:s`, `/resources/:r`, `/graphs/:g`, `/maps/:m`, `/maps/:m/resources/:r`, `/maps/:m/graphs/:g`, `/maps/:m/graphs/:g/present/:r` (checked in `productDestinationPath`).
4. Explicit URL context wins for that navigation and never edits authored selections.
5. Resolving a URL is navigation, never authoring. Open/Closed, membership, default Map and Active Graph are untouched.
6. Surface state (camera, selection, drafts, Open/Closed) is not encoded.
7. The host resolves the same destination contract: malformed input is 400, a well-formed but unresolved destination is a real 404, and there is never silent substitution.
8. A presentation URL names the current Resource, not the Traversal history. Every addressable move pushes a history entry.

**0081**
1. Navigation answers `NavigationAddress` (selected Map, Active Graph, presenting Resource), derived by a pure function and not stored (checked, `navigationAddress` in `navigation.ts`).
2. Navigation never learns URLs. It imports no `@project/http` and does not read `window.location`.
3. `destinationSync` in `app` answers `push`/`replace`/`none` by comparing the address with what the current pathname resolves to.
4. Call sites never pair a Navigation op with a history write. There is no `moves = …` comparison.
5. `popstate` is idempotent by construction. History records one entry per committed address, not one per operation.

**0061**
1. `tsc` is TS7 (`@typescript/typescript7`) and is the only type-checking truth.
2. `typescript` resolves to the TS6 bridge (`tsc6`, `createProgram`) for typescript-eslint and prisma-next. Do not unify the names, do not change source for TS6, and do not add a TS6 check.
3. `typecheck:toolchain` runs first in `verify` and asserts both halves.
4. The removal condition is written down: stable replacement API, typescript-eslint support, other consumers, and `verify` green with `typescript` pointing at 7.
5. The `@ladle/react` `@ts-nocheck` patch stays until upstream ships declarations.

**0062**
1. `no-unsafe-type-assertion` is an error. Existing sites sit in the generated `eslint-suppressions.json`, and nothing joins them.
2. `--prune-suppressions` runs in `lint`/`verify`, so the ratchet only falls. The file is never hand-edited or regenerated over growth.
3. `require-safety-comment-for-type-assertion` and `no-chained-type-assertions` still apply. `as const` and broadening to `unknown` stay legal.
4. `assertion-ratchet.test.ts` resolves the severity per file kind and pins the ceiling.
5. Do not schedule a drain, and do not dodge a finding by widening types or moving code into helpers.

**0071**
1. Node is pinned exactly (26.8.1 in `.node-version`, checked).
2. The browser floor is evergreen browsers with native `Uint8Array` base64/hex codecs.
3. TS `lib` is ES2025 plus `ESNext.TypedArrays` and `target` is ES2024 (checked). Native codecs are used without polyfill or `Buffer` (checked in `core/src/compact-uuid.ts`). Any further newer API needs its own decision.
4. The CI Playwright image is kept, with Node overlaid via `setup-node` from `.node-version`, and there is no derivative image (checked in ci.yml).

## Consolidated outline: "Canvas, addresses, toolchain — current design"

### A. Canvas, camera and presenting (~750 words)
1. **Presenting is traversal on the same canvas.** Traverse the Active Graph from the Active Resource. There is no deck, slide, second surface or sequence framework, and "Slide" is not a term.
   Sources: 0024, 0027, superseding 0008. Held by: `cameras.tsx` `PresentingCamera`; the absence of `reveal`/`isLinear` (no test holds this, only grep).
2. **There is no linear special case.** One outgoing Edge is a one-member selection. Sources: 0024, 0027. Held by: `presenting-keys.ts`.
3. **Keys.** Up/Down select a branch, Right commits, and Left retreats along Traversal history, not the Graph. Source: 0027. Held by: `presenting-keys.ts`, `PresentingChrome.tsx` and its tests.
4. **The fork is chrome.** `PresentingChrome` lists the outgoing Edges, and the active Resource draws full rendered content in container-query units. Source: 0027. Held by: `ResourceNode.tsx`, styles.css.
5. **The camera is issued, never awaited, and never caught.** Sources: 0043, 0044. Held by: `packages/app/test/cameras.*`.
6. **The presenting move is one `fitView`.** The lever is `ease`/`interpolate`, and `maxZoom = MAX_ZOOM` covers the presenting zoom. Sources: 0044, 0043. Held by: `camera.ts`, `cameras.tsx`.
7. **Handles are Graph-independent.** There are four spatial handles in the Active Graph's colour. The side is not stored, and only `{from,to}` is. Sources: 0033, 0087. Held by: `ResourceNode`, the edge-authoring tests.
8. **Seeking handles** reveal within 80 units and only when eligible under `edgeEligibility`. `isValidConnection` gates the release and self-edges are legal. Sources: 0090, 0033, 0032. Held by: `connection-target-reveal.ts` and its test.
9. **Empty drop** cancels. Option/Alt creates a Resource, its placement and the Edge atomically, and the target is selected afterwards. Source: 0033. Held by: `edge-authoring.ts` `dropTarget`/`newResourceDrop` and e2e.
10. **Map/Graph deletion rewrites the selecting Space Resources** in the same Edit. Framing resets on Map deletion. Source: 0091. Held by: `space-resource-planning.ts`, `session-registry.test.ts`. This rule arguably belongs in the Space Resource cluster, not here.
11. **Pin note:** every camera fact and the `interpolate` default are facts about @xyflow 12.11.2 and must be re-read when the pin moves. Sources: 0043, 0044.

### B. HTTP and product addresses (~500 words)
1. **Fetch-native Hono app.** The inferred type drives the typed client, and runtime schemas validate the wire. There are no `node:`/Vite imports, and hosts own assets and lifecycle. Source: 0034. Held by: the package ESLint zones and tsconfig paths. Whether a test holds the no-`node:` rule is unverified.
2. **Durable product URLs.** One per Space, Resource, Map and Graph, using the compact 22-char base64url form, which is used only in browser routes. Sources: 0069, 0071, 0079. Held by: `compact-uuid.ts`, `product-destination.ts` and their tests.
3. **Route table and context.** Explicit context wins and never authors. Surface state stays out of URLs. Sources: 0069, 0079.
4. **One destination contract** for host and browser: malformed is 400, unresolved is 404, and there is no substitution. Sources: 0069, 0079. Held by: `resolveProductDestination` and the http tests.
5. **Presentation URL** names the current Resource only. Source: 0069.
6. **Navigation answers `NavigationAddress`** and never knows URLs. `destinationSync` decides push, replace or none, `browserHistory()` in `space.ts` is the only browser adapter, and a missing `popstate` loop stays safe. Sources: 0081, and ADR "0081-plus" in AGENTS.md. Held by: `browser-location.test.ts`.

### C. Toolchain and platform floor (~400 words)
1. **TS7 is `tsc`, and `typescript` is the TS6 bridge.** It carries a written removal condition, the toolchain assertion runs first in `verify`, and the ladle patch stays. Source: 0061. Held by: `scripts/check-typescript-toolchain.ts` and its test.
2. **The narrowing-assertion ratchet.** The rule is an error, the suppressions are generated and prune-only, and the safety-comment rule still applies. Source: 0062. Held by: `assertion-ratchet.test.ts`, `typing-fixtures.test.ts`.
3. **Platform floor.** Node is pinned exactly. The TS lib is ES2025 plus `ESNext.TypedArrays` with target ES2024, native codecs are used with no polyfill, and each new API needs its own floor. The Playwright image gets a Node overlay. Source: 0071. Held by: `tsconfig.base.json`, `.node-version`, ci.yml.

**Estimate:** about 1,650 words, against 8,986 source words (about 18%). Around 3,000 words of source are already restated in rendering.md, AGENTS.md and http.md, so for 0043, 0044 and 0033 especially the ADRs are currently a third copy.

## Drift and contradictions

1. **0043 is violated in code, and rendering.md is false.** `packages/app/src/components/CanvasContinuation.tsx:147` does `void flow.fitView({nodes:[{id}], padding: 0.5, duration: 0}).then(() => element.focus())`. That chains required work (focus) on a camera Promise. rendering.md also claims "Every camera call in the app lives in `components/cameras.tsx`", which is false for this call. With `duration: 0` it may well settle, but I did not verify that, and it still breaks the rule as written.
2. **0033's "route-less Space ... lazily minted Route 1" is overtaken.** The schema gives a Map `graphs: min(1)` (per `edge-authoring-react.test.tsx:176` comment), and connecting without a Graph refuses `map-active-graph-required`. Two stale mentions remain:
   - `edge-authoring.ts:591` has the comment "a Map with no Graph mints one for its first Edge".
   - rendering.md bullet 1 lists "Initial-Graph minting ... built".
3. **0033 says "exact duplicate Edges are no-ops".** The code refuses `edge-already-exists`, and 0090 makes duplicates ineligible, which means no handle and no snap.
4. **0033 says targets appear "on every card" and mentions Algorithmic View conversion.** The first was replaced by 0090. Algorithmic Views are gone (0079/0086). 0033 carries no Refined-by for 0079.
5. **0027 frames the overview with `fitBounds`.** The code uses `fitView(OVERVIEW_FIT)`. 0027 also cites TanStack Router, which is removed.
6. **0024: "opening shows source, presenting shows rendered".** This was overtaken by 0064, under which an Open Resource renders Markdown and editing swaps to source.
7. **0069 contains three overtaken or unbuilt parts:**
   - The `entrySpaceId` paragraph was overtaken by Meta Space (0074 says to read it as retired, 0077, 0078), and CONTEXT.md lists Entry Space under _Avoid_.
   - The `views` routes and the Computed View/Layout collision rule were overtaken by 0079.
   - The cross-Space presentation "canonical query value carrying ordered Space crossings" is **not implemented**: `product-destination.ts` has no query handling. I found no ADR that drops it, and CONTEXT.md still describes cross-Space Edges in Presenting.
8. **0071 says "Vite's emitted-language tooling target remains ES2024".** No Vite config sets `build.target` (checked: `packages/app/*.ts`). Only `tsconfig.base.json` sets `target: ES2024`, so this claim is unverified at best.
9. **0062's As-built counts are stale.** It says 79 findings in 36 files. The live ceiling is 47/25 (`assertion-ratchet.test.ts` `CEILING`, and `eslint-suppressions.json` has 25 files and 47 findings, checked). AGENTS.md is correct. This is expected ratchet drift, but the ADR reads as current.
10. **0081 has stale code facts.** It names Navigation's imports as `./renderer`, but they are now `./map-resolution`. It also uses "renderer", "Space View" and "Card" throughout, and `continueInRenderer` no longer exists (checked).
11. **0034 says "Node 24".** The project pins 26.8.1 (0071).
12. **http.md does not cover 0069 or 0081.** It never mentions `ProductDestination`, the compact ids or the 400/404 destination contract, although `@project/http` owns them. That rule lives only in AGENTS.md. 0071 and 0091 appear in no agents doc at all.
13. **0008 outside docs/adr:** it is cited only in the directory tree listing in `docs/agents/domain.md`, which is harmless. 0027 and 0044 also reference 0008-era reasoning ("ADR 0008 separated them") as history only.
