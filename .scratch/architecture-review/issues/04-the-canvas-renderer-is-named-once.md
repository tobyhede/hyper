# The canvas renderer is named once

Status: resolved

Surfaced by: the 2026-08-19 architecture review's first candidate, then by
grilling the name rather than the change. The derivation defect that started it
is issue 06; this ticket is the vocabulary that has to settle before 05 and 06
are written, or they add more names in the old one.

Blocked by: None. `docs/agents/workflow.md:66` — "Never let a rename ride along
with a structural change" — and `:68` — a rename "should run alone, and early".
This is the early one.

## The defect

One object — the View or Layout currently drawing the Space's Cards — has six
names, and the type that identifies it is named after the act rather than the
thing:

```
RendererSelection      renderer.ts:118    the type       — a "selection"
selectedRenderer       navigation.ts:25   field          — holds one
defaultRenderer()      renderer.ts:472    function       — returns one
initialRenderer        navigation.ts      parameter      — takes one
CanvasChoice.selected  canvas-choice.ts   row            — the same object again
SelectedCanvas         WorkspaceSidebar   component      — names a canvas, draws a renderer
defaultView            core/schema.ts:267 persisted field — holds a Layout id
```

Every one of the four `renderer`-named things is correct about the *object* and
wrong only because the type it holds is called a selection. Rename the type and
all four become accurate without touching the verb.

**The verb is `select` and does not change.** ADR 0031 —
*"Views and Layouts are selected; conversion keeps no provenance"* — is accepted
and states it in its title. `CONTEXT.md:120` uses "selecting another View".
`navigation.selectRenderer`, `rendererSelectionKey` and the sidebar's `onSelect`
all follow from it and all stay. An earlier round of this design loop argued for
`choose`; it was wrong, and the argument it rested on — that `selectedRenderer`
already meant something else — was deferring to the one name in the set that was
itself a residue.

**Where the names came from.** `fe06fcc` (2026-08-03) introduced
`selectedRenderer` and `selectedView` together, `selectedView` existing only to
give the View Select a value while a Layout drew. Issue 14 deleted `selectedView`
with the toolbar; `selectedRenderer` outlived the control that named it.
`CanvasChoice` and `SelectedCanvas` were then coined beside it by the Sidebar.
Three surfaces, three vocabularies, one object.

**`defaultView` contradicts the glossary directly.** `CONTEXT.md:118` already
says "The Space may name either as its **default renderer**", and the schema
field has been called `defaultView` since it was written — while accepting a
Layout id, which `packages/app/stories/support/spaces.ts` relies on.

## What to build

### 1. The type

`RendererSelection` → **`CanvasRendererId`**. It is an identity: it names *which*
canvas renderer across two kinds, and it is a discriminated union only because a
View's id is a `BuiltInViewId` and a Layout's is a UUID. `BuiltInViewId` in
`packages/core/src/schema.ts:215` is the precedent that `Id` here does not mean
UUID.

`rendererSelectionKey` → `canvasRendererKey`.

16 files name `RendererSelection`, all inside `packages/app` — 8 source and
stories, 8 tests.

### 2. The persisted field

`spaceFileSchema.defaultView` → **`defaultRenderer`**, with its doc comment
(`packages/core/src/schema.ts:208-210, 266-267`) reworded to say renderer rather
than view.

**Roll forward. Do not add a back-compat path** — see ADR B below. No `refine`
rejecting the old key, no `SPACE_FILE_VERSION` bump, no transitional read. The
footprint is one schema field, ~20 mechanical test occurrences, two `README.md`
lines and one story-fixture literal. `packages/app/fixture/space.json` does not
carry the field; `packages/app/.space/space.json` does but is untracked and
already stale from the Route era. Nothing in the application has ever written it.

There is no SQL migration: `spaceDocumentSchema` is
`spaceFileSchema.omit({ id: true })`, the JSONB document stored beside a space's
relational UUID, and neither `contract.prisma` nor `migrations/app/` names the
field.

### 3. The module and the surface

- `packages/app/src/canvas-choice.ts` → `canvas-renderers.ts`
- `canvasChoice(space, selected)` → `canvasRenderers(space, selected)`
- `CanvasChoice` → `CanvasRenderers`
- `CanvasRenderer` — **unchanged**. It is CONTEXT.md's own phrase and is the one
  name in the set that was already right.
- `SelectedCanvas` → `SelectedCanvasRenderer`
- `App.tsx`'s `chooseRenderer` → `selectCanvasRenderer`, and the comment at
  `App.tsx:210` explaining why the handler and the prop disagree is **deleted**,
  not rewritten. It was covering for this defect.

The module keeps its single operation here. Splitting it is issue 05, and the two
must not land together.

### 4. CONTEXT.md

Add **Canvas renderer** to the "Layout and views" section: *a View or a Layout in
the role of drawing a Space's Cards on the canvas*. It is what `CONTEXT.md:118`
already describes without giving it an entry, which is why the name drifted —
there was nothing to drift from.

`_Avoid_` must carry, at minimum: **choice** (the value is the renderers and
which is current, not an act); **canvas** alone (the canvas is the surface, and
there is one); and any name taken from the control that draws it — selector, menu
item, row.

**Do not put the flat-versus-tagged detail in CONTEXT.md.** `workflow.md` — "a
glossary, not a design doc. No file formats, storage, or rendering libraries."
That belongs in ADR A and in the schema's own doc comment.

### 5. ADR A — the naming decision

New ADR, `Refines: 0053`. `docs/adr/0053-…` gets `Refined by:` added to its
status block and **nothing else edited** — accepted ADRs are immutable and that
line is the only edit one ever receives.

The negative is the valuable half: **do not name the drawing renderer after the
control that draws it.** It has happened three times, once per surface. The next
surface will do it again unless this says not to. Record the rejected
alternative — making every name say *selection* instead — and why the type was
renamed instead: it fixes six names by fixing one, and leaves ADR 0031's verb
alone.

Also record here, not in CONTEXT.md, that the identity has two representations:
the persisted form is flat (`BuiltInViewId | UUID`) and the in-memory form is
tagged, with `defaultRenderer(space)` the reader between them.

### 6. ADR B — the prototype rolls forward

A second ADR, independent of the first, because it is what licenses §2 and
because its absence is what sent this design loop inventing three back-compat
options for a codebase that has none.

**There are no old documents. The only data are fixtures. Roll forward.**

It clears the bar: surprising — a `version` literal, a `documentRefusal` gate at
`packages/graph/src/space.ts:172` and a `migrations/app/` directory all read as a
codebase that wants migrations; a real trade-off — versioned readers and
transitional keys rejected, the accepted cost being that any hand-authored
document outside this repo breaks silently.

**State the boundary or it will be over-applied.** `migrations/app/` and the
prisma-next contract are how the relational schema is *defined and applied*, not
a back-compat obligation, and this ADR must not read as licence to delete them.

`AGENTS.md` points at it; it does not restate it. `CLAUDE.md` is a symlink to
`AGENTS.md`, so that is one edit.

### 7. The version

`0.1.0` → `0.0.0` in all eight `package.json` files, in ADR B's commit. Nothing
is published — no `publishConfig`, no release workflow — so the number documents
intent, and a reader checking ADR B's "unreleased" premise should not find
`0.1.0` and disbelieve it.

## Commit shape

Docs first, then the rename, so the rename diff is readable on its own:

1. ADR B + `AGENTS.md` pointer + the eight version lines.
2. ADR A + the CONTEXT.md entry + `Refined by:` on 0053.
3. The type rename and everything that follows from it.
4. The schema field rename.

## Acceptance criteria

- [ ] `RendererSelection` and `rendererSelectionKey` no longer exist; `CanvasRendererId` and `canvasRendererKey` do, across all 16 files.
- [ ] `spaceFileSchema` declares `defaultRenderer`; no `defaultView` remains in `packages/`, `README.md` or the story fixtures; no `refine`, version bump or transitional read was added.
- [ ] `canvas-renderers.ts` exports `canvasRenderers` and `CanvasRenderers`; `CanvasRenderer` is unchanged; the module still has one operation.
- [ ] `SelectedCanvasRenderer` replaces `SelectedCanvas`, and `App.tsx:210`'s comment is gone rather than reworded.
- [ ] `CONTEXT.md` has a **Canvas renderer** entry with an `_Avoid_` list, and no file-format or storage detail in it.
- [ ] Two ADRs land; `0053` gains `Refined by:` and no other edit; `AGENTS.md` points at ADR B without restating it.
- [ ] All eight `package.json` files read `0.0.0`.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, with real output quoted. `pnpm e2e` must be **green and unchanged** — this is a behaviour-preserving rename and that is the guard that proves it.

## Decided — do not re-open

- **The verb stays `select`.** ADR 0031 states it in its title. `choose` was argued for and rejected on that evidence.
- **`CanvasSelection` in `render-adapter.ts` is not a blocker.** It means *what is selected on the canvas* — `none | card | edge` — and has coexisted with `RendererSelection` without confusion. It is not renamed here.
- **The rename does not reach `ResolvedRenderer`, `resolveRenderer` or `checkSubject`.** Those are already accurate.
- **Half the rename was considered and refused.** Stopping at the in-memory boundary would leave `defaultView` contradicting the glossary in the persisted format, which is the same defect this ticket exists to end.

## Answer

Implemented as a five-commit vocabulary stream. ADR 0054 records the prototype's
roll-forward boundary and all workspace package versions now say `0.0.0`; ADR
0055 names the Canvas renderer and refines ADR 0053. The application now uses
`CanvasRendererId`, `canvasRendererKey`, `canvasRenderers`, `CanvasRenderers`, and
`SelectedCanvasRenderer`, while the persisted field is `defaultRenderer`
through schema, intake, storage, export, fixtures, and documentation.

TDD evidence: the renamed public schema tests failed first (2 failures) before
the field was rolled through the implementation, then 228 focused tests passed.
Final verification: `pnpm verify` passed; `pnpm e2e` passed all 97 unchanged
tests; `pnpm e2e:ladle` passed 8 tests. The two-axis review found one remaining
`choice` value name and one plural `canvases` comment; both were corrected, and
the final Standards and Spec re-reviews reported no findings.
