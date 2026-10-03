# 08: Content action is answered from resolved content

**What to build:** `core`'s `resource-content.ts` gains `contentAction(content: ResourceContent): 'none' | 'edit-markdown' | 'replace-image' | 'author-space-view'`, answered from one private table that `satisfies Record<ResourceContent['kind'], …>`, and `'none'` whenever `via` is `'reference'` (ADR 0113, ADR 0114). Every site that restates "this content may be authored" asks it instead:

- `ui`'s `beginEditing` and `beginReplacing` (`resource-display.ts:61`, `:80`)
- `CanvasResource.tsx:336` (`contentFront`), `:338` (`spaceFront`) and `:358` (`contentAuthoring`)
- `react-flow-adapter`'s `ResourceNode.tsx` `frontOf`, for which arms carry `onBeginEdit`
- `app`'s `canvas-resource-decoration.ts:249`, `:255`, `:282` and `canvas-resource-authoring.ts:225-226`
- `embedded-open-space-resource.ts:206` (`via === 'reference'` read-only)

No behaviour changes. The rendering switches that draw each content shape (`frontOf`'s arms, `useAreaContent`, `PresentedContent`) stay as they are.

**Blocked by:** none (ADR 0114 and the `CONTEXT.md` **Content action** entry are recorded)

**Status:** ready-for-agent

- [ ] A `core` property test over every `ResourceContent` arm and both `via` values proves `contentAction` answers `'none'` for every `via: 'reference'` and for `ur` and `unresolved`, and the kind's action otherwise.
- [ ] No source site outside `resource-content.ts` names `'markdown' | 'image'` or reads `via` to decide whether content may be authored.
- [ ] Existing Edit, Replace and embedded-Map authoring tests pass unchanged.
- [ ] CI passed on the draft PR.

## Comments

2026-10-03: Built the core contentAction function over one exhaustive private content-facts table and migrated UI, adapter and application authoring decisions. Closed projections publish the action without carrying content. Core properties cover all valid kind/via combinations; existing display, replacement and embedded authoring tests remain green.

Implementation complete; independent review and the draft PR CI gate are pending. Status remains ready-for-agent until those checks pass.
