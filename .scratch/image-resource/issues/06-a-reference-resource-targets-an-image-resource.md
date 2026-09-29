# 06 — A Reference Resource targets an Image Resource

**What to build:** Create Reference on an Image Resource creates a Reference Resource whose Open front draws the Target's image read-only, through the same content front as the Image Resource minus Replace (ADR 0070, ADR 0106). `resolveContentResource` resolves an image Target in one hop like the others. The Reference Resource's own first Open reads the Target's recorded natural size by the same rule, synchronously.

**Blocked by:** 03, 05, `resource-content` 06

**Status:** ready-for-human

- [x] Create Reference is available on an Image Resource and names the new Reference Resource after it.
- [x] The Open Reference Resource draws the Target's image and offers Close and Title editing, no Replace.
- [x] Replacing the Target's image changes what the Reference Resource draws.
- [x] `CONTEXT.md`'s Reference Resource entry lists Image Resource Targets (already written) and matches what is built.

## Comments

**2026-09-29, rework on `resource-content`.** A first implementation (PR #320, commit `209df220`) was built on an earlier `image-resource-05`, which has since been redesigned: ADR 0107 is gone (its substance is in ADR 0106), `imageUrl` is part of an Image Resource node's kind and may not be carried by a Reference Resource's node, and Replace image is an in-place upload target on the rail. Fixing that exposed that a Resource's content is inferred from which node fields are present, falling back to an empty Markdown document — which is what made the first implementation's closing fade draw nothing. `.scratch/resource-content/` replaces that inference with one resolved content value and a display state. Once its ticket 06 lands, this ticket reduces to the first-Open size rule for a Reference Resource to an Image Resource plus its tests and proofs: a Reference Resource to an image is image content with `via: 'reference'`, drawn through the same arm with Replace withheld. The graph half of `209df220` (`resolveContentResource` resolving an image Target, and `openSizeDocument`) is carried forward on this branch.

**2026-09-29, built on `resource-content` 06.** The drawing half needed nothing new: `resolveResourceContent` answers a Reference Resource to an Image Resource as `{ kind: 'image', url, via: 'reference' }`, and `CanvasResource` draws it through the image arm with Replace withheld on the rail and in the failed-image state (`CanvasResource.test.tsx`, "offers no Replace for an image it draws through a Reference Resource", from `resource-content` 03). The first-Open rule is `openSizeDocument` in `packages/graph/src/snapshot-edits.ts`, tested in `packages/graph/test/image-open-size.test.ts` (carried forward in `08202fa9`). This change adds the tests and proofs:

- `packages/app/test/resource-rail-actions.test.tsx`: "creates a Reference Resource from an Image Resource, named after it with the caret in its Title". The row is available on an Image Resource, the new document is `{ title: 'Harbour', kind: 'reference', target }`, and the focused Title editor holds `Harbour`.
- The stable story **Components/Resource/Open Image Reference Resource** (`OpenImageReference`). It draws two Reference Resources out of a real Space, `imageReferenceSnapshot` in `packages/app/stories/support/spaces.ts`, which holds their Image Resource Targets. So the specimen resolves their content through `resolveResourceContent` rather than being handed it. `CanvasResourceNodeSpecimen` gained an optional `drawn: DrawnMap` for that. One Target's picture loads (`https://example.com/harbour.png`, served by the test) and one never does (`https://missing.invalid/picture.png`). Both are at the first-Open size.
- Ladle proof: `packages/app/ladle-e2e/resource-open.spec.ts`, "an Open Reference Resource draws its Image Resource Target's picture read-only". It checks the picture at its own size above the Reference Resource's own Title, and the toolbar's Close with no Replace or Edit. It also checks that the failed state names the URL with no Replace.
- Application proof: `packages/app/e2e/image-resource.spec.ts`, same title. It creates the Reference from the Image Resource's menu (named after it, caret in its Title, stored document checked) and Opens it. It checks the authored size is 400×300 plus `OPEN_RESOURCE_CHROME`, and that the failed state names the URL with no Replace. It checks Close is on the toolbar with no "Replace image of Resource …" and no Edit. It then replaces the Target's image with a URL through the Target's own rail Replace and upload target, and the Reference's picture changes to the new URL and loads.
- Parity claim `open-reference-draws-target-image-read-only` in `packages/app/stories/parity-claims.ts`, tagged on both proofs.

`AGENTS.md`'s ADR 0070 entry now states both halves: the picture drawn with no Replace, and the first Open reading the Target's recorded natural size by ADR 0106's synchronous rule, in `SnapshotEdit.open`. `CONTEXT.md`'s Reference Resource entry already listed Image Resource Targets. It now also says the picture is drawn without Replace and the first-Open size rule. No ADR 0107 citation remains outside this ticket's history.

`pnpm verify` passed (275 files, 3912 tests), as did `pnpm e2e` (265 passed) and `pnpm e2e:ladle` (138 passed).
