# 04: Editing and replacing are display states only a Resource's own content enters

**What to build:** A body edit and an image replacement become display states — editing carries the Markdown and its editor, replacing carries the image and its replacer — produced only by two pure helpers the decoration step applies. Each helper leaves the display unchanged unless it is Open with the Resource's own content of the matching kind, so a Reference Resource cannot be given an editor or Replace by construction rather than by a runtime branch. `autoFocus` is required, defaulting to false.

**Blocked by:** 03

**Status:** resolved

- [x] Editing a Markdown Resource's body and replacing an Image Resource's image behave as before, proved by the existing application and Ladle proofs.
- [x] A property test of the helpers: each returns the same display unchanged or an editing/replacing display that returns to it at rest, and the second only for Open own content of the matching kind.
- [x] A read-only Resource given an editing display draws rendered Markdown with no editor.
- [x] The Resource toolbar stays visible while editing or replacing, reading the display.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

## Comments

**2026-09-29** — Built. `ResourceDisplay` in `packages/ui/src/resource-display.ts` gains `editing` (own Markdown, `editor`, required `autoFocus: boolean`) and `replacing` (own image, `replacer`), with `OwnContent<K>` for the narrowed content. They are made only by `beginEditing(display, editor, autoFocus = false)` and `beginReplacing(display, replacer)`, which return the same display object unless it is `open` with `via: 'self'` content of the matching kind. The narrowed content is rebuilt field by field once `via` is narrowed, with no assertion. `atRest` maps both back to `open` with the same content; it is overloaded so a `FrontDisplay` stays a `FrontDisplay`. All four are exported from `@project/ui`.

`decorateMarkdownResourceNode` and `decorateImageResourceNode` now patch `display` through the helpers. They patch it only when the helper changed it, so a caret that lands before the Open projection draws nothing, which matches sketch Q6. **The decoration passes `autoFocus: true`.** `MarkdownResourceBody` defaults `autoFocus` to true, and production never set `autoFocusEditor`, so the old production behaviour was focused. The helper's `false` default would have removed focus from every canvas edit. The converted unit tests pass `true` for the same reason. The only `false` caller is the story's "Unfocused edit" mode.

`CanvasResourceFront` no longer has `editor` or `autoFocusEditor`. `CanvasResource` computes `atRest(props.display)` once, at the top, when `readOnly`. It takes the editor and `autoFocus` from the `editing` arm and the replacer from the `replacing` arm, both gated on `contentAuthoring`, so nothing is drawn while leaving. `ResourceNode`'s `toolbarVisible` reads `display.shown === 'editing' | 'replacing'`. It no longer reads `data.bodyEditor` or `data.imageReplacer`.

Evidence:
- `packages/ui/test/resource-display.test.ts` holds the helper properties. Either the same object comes back, or an editing/replacing display whose `atRest` equals the input, and only for Open own content of the matching kind. It generates every display, including the two made by the helpers.
- `CanvasResource.test.tsx` "draws rendered Markdown with no editor for a read-only Resource given an editing display".
- `ResourceNode.test.tsx` "reads a running edit from the display, not from the node field that carried it", plus the existing unselected edit and replace toolbar cases, whose fixture now enters those states only through the helpers.
- `canvas-resource-decoration.test.ts` holds the editing and replacing patches, and holds that no patch is made on a Closed Resource.

`bodyEditor` and `imageReplacer` are still populated on the node for 06 to delete. Only tests in `packages/app/test/canvas-resource-authoring.test.tsx` and `canvas-resource-decoration.test.ts` still read them. `docs/agents/rendering.md`'s `bodyEditor` sentence now names the `editing` arm.

`pnpm verify` passed (275 files, 3914 tests), as did `pnpm e2e` (264 passed) and `pnpm e2e:ladle` (137 passed).
