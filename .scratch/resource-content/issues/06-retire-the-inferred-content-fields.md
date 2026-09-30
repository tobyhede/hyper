# 06: Retire the inferred content fields (contract)

**What to build:** Nothing infers a Resource's content any more, so the fields and fallbacks that did are deleted: the node's optional body, image URL (and the image arm of the node's kind), Space content, presenting flag, body editor and image replacer; the old single-hop resolution and its result type; the presenting component's own content union; and every empty-string fallback. The docs that name them are brought into line. After this, "no content where content is owed" cannot be written.

**Blocked by:** 04, 05

**Status:** resolved

- [x] None of the retired fields, types or functions remains in source, tests or stories.
- [x] `graph`'s package surface no longer lists the old resolution.
- [x] `AGENTS.md` (the ADR 0070 entry's resolution sentence) and `docs/agents/rendering.md` describe the content value and display.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

## Comments

**2026-09-29** — Built. `ResourceNodeData` no longer has `body`, `showContent`, `spaceContent`, `bodyEditor` or `imageReplacer`, and `ResourceNodeKind`/`nodeKind` are gone: the node's `kind` is a plain `Resource['kind']`, and an Image Resource's URL reaches a node only inside an Open or presented `display`. The projection keeps `presented` as a local and resolves content only through `resolveResourceContent`. The decoration patches `display` alone (`CanvasResourceDataPatch` lost its two keys). `resolveContentResource`, `ResolvedContentResource` and `suppliesContent` are deleted from `graph`, and the index and `test/unit/graph-package-surface.test.ts` drop them; the `resolveContentResource` table in `lookup.test.ts` went with it, its cases being `resolveResourceContent`'s table already. `beginEditing`'s `autoFocus` is required. The long `bodyEditor` doc comment was dropped rather than moved, since what it said that is still true is already on `MarkdownResourceBodyEditor.onEnd`.

Tests and stories now set and read `display`: `canvas-resource-authoring.test.tsx` asserts `display.shown === 'editing'` and reads the replacer from the `replacing` arm; the `data.bodyEditor` test in `ResourceNode.test.tsx` ("reads a running edit from the display, not from the node field…") and the decoration test for the `bodyEditor` patch are deleted, their fields being unwritable. `CanvasResourceNodeSpecimen` takes `content?: ResourceContent` in place of `body`/`imageUrl`; omitted, an Open specimen draws the fixture Resource's resolved content (`resolveResourceContent`) instead of `''`, which changes only `ResizeControl`'s Open specimens from an empty body to the Strategies text. `render-adapter.test.ts`'s two `open = true` fixtures now carry an Open display. `AGENTS.md`'s ADR 0070 entry names `resolveResourceContent` and the display; `docs/agents/rendering.md` already named only the display arms. `docs/superpowers/plans/2026-07-29-layout-conversion-on-edit.md` still shows `showContent` and is left as a dated historical plan.

`pnpm verify` passed (275 files, 3911 tests), as did `pnpm e2e` (264 passed) and `pnpm e2e:ladle` (137 passed).
