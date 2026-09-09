# 04 — Make Space Cards select initialized Layouts

Status: ready-for-agent
Tags: release/v1
Blocked by: none

**What to build:** Make every Space Card select a durable Layout and Graph in its
target Space, as ADR 0079 requires. Card creation initializes a layoutless target
before completing, and Opening or Entering resolves the Card's stored Layout
context rather than the target Space's own navigation selection.

- [ ] Space Card content stores a target Space, selected Layout and selected
      Graph, with no Space View or Computed View alternative.
- [ ] Creating a Space Card against a layoutless target waits for durable target
      initialization and stores the resulting default Layout and Active Graph.
- [ ] Initialization or target-load failure produces no Card, dangling reference
      or partially persisted aggregate Edit.
- [ ] The Layout and Graph the Card stores are the context any Open or Enter
      resolves, and navigating inside the target writes neither selection back
      until an authored Edit records one under the established ownership rules.
- [ ] Several Space Cards may reference one target while selecting different
      Layouts and Graphs, and each selection survives aggregate round-trip. The
      selected Graph is that embed's Active Graph and emphasises only: which
      Edges an embed draws is decided by the selected Layout's own Graphs, so
      two Cards on one target at different Graphs differ in emphasis and not in
      the Edges they show (ADR 0026).
- [ ] Direct, self, missing and incompatible target contexts retain stable refusal
      or not-found semantics with accessible recovery where one exists.
- [ ] Application, Ladle and E2E evidence covers an initialized target, a
      layoutless target, two selections of one target and initialization failure.

This ticket owns the Space Card's selected-Layout content and the initialization
it requires of a target.
[entity URL 07](../../entity-url-addressability/issues/07-author-a-space-card-reference.md)
keeps ownership of Space Card creation and cascade semantics,
[entity URL 08](../../entity-url-addressability/issues/08-enter-and-independently-open-a-space-card.md)
owns the Open and Enter surface that reads this context, and
[V1/08](../../v1-release/issues/08-round-trip-multi-space-import-and-export.md)
owns preserving these selections through the aggregate round trip.

## The state this starts from

Verified against the merged tree on 2026-09-09. Read this before re-deriving it;
none of it is built, and the seam is further along than the storage is.

- **The selection is still optional in the schema.**
  `packages/core/src/schema.ts:61-62` declares `layout: uuidSchema.optional()`
  and `graph: idSchema.optional()` on `spaceCardFrontmatterSchema`. Making both
  required is the change the first criterion asks for, and it rolls fixtures,
  migrations and tests forward with it.
- **The persistence seam already accepts them, and nothing supplies them.**
  `LinkSpaceCardInput` takes `readonly layout?: UUID` and `readonly graph?: UUID`
  at `packages/persistence/src/session-registry.ts:90-91`, and they are written
  onto the document at `:621-622`. The only caller passes neither: the Space Card
  creation input built at `packages/app/src/App.tsx:339-344` carries
  `containingSpaceId`, `layoutId`, `title` and `position`, and `:346-348` hands
  it to `spaceCards.create` or `spaceCards.link` unchanged. So the seam does not
  need widening — the caller needs a selection to pass, and `create` needs one at
  all.
- **`create` mints a Layout and a Graph and then discards them.** It calls
  `initializeSpace` at `session-registry.ts:655` to make the target, and stores
  `{ title: input.title, kind: 'space', spaceId: target.id }` at `:669` — the
  Layout and Active Graph that initialization just minted never reach the Card.
  That is the second criterion's whole body: keep them and store them in the same
  aggregate Edit.
- **The embed silently skips a Card with no selection.**
  `packages/app/src/components/SpaceCanvas.tsx:327` reads
  `if (document?.kind !== 'space' || document.layout === undefined) continue;`, so
  a layoutless Space Card draws nothing rather than refusing. Once the schema
  requires a Layout this branch narrows to a type-level boundary; until then it
  is why the gap is invisible on the canvas.

## Comments

### 2026-09-09 — Unblocked; the work is unbuilt

`Blocked by` was `03; space-cards/03; space-cards/01`. All three are done and the
line is now `none`, with `Status` left at `ready-for-agent` because none of the
criteria above is satisfied:

- `layout-only-v1/03 — Make Layout the only V1 canvas selection`: `Status: done`.
- `space-cards/03 — Build the Space Card lifecycle and aggregate persistence`:
  `**Status:** resolved — merged by PR 134 (67ec0371)`.
- `space-cards/01 — Open and edit a Space Card in place`: `**Status:** resolved —
  the selected target Layout is editable through its shared session`.
