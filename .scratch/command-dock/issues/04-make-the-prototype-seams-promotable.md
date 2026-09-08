# 04 — Make the prototype's seams promotable

Status: resolved

**What to build:** Four structural properties that are fine in a story and are not
promotable. All three adversarial reviews raised the first one independently.

- [x] **Split `Chrome`.** It is a 33-member object threaded whole into ten
      components, and its identity changes every render. `SpaceSidebar` — the
      promoted sibling that does the same job — takes grouped props instead
      (`packages/app/src/components/SpaceSidebar.tsx:95-186`). Follow it.
- [x] **Use the branded ids.** `@project/core` brands `LayoutId`, `GraphId` and
      `CardId`; the prototype declares every id as `string` (22 sites) and
      launders 13 of them through `String(...)`, so `switchTo(cardId)` compiles.
      Five of those thirteen are `03`'s to remove at the `@project/ui` seam — this
      ticket owns the declarations.
- [x] **`String(snapshot.document.defaultLayout)` yields the literal `"undefined"`
      for a layoutless Space** (`command-dock.stories.tsx:352`).
      `defaultLayout` is `uuidSchema.optional()` (`packages/core/src/schema.ts:303`).
      This is a live bug and the branded-id work is what surfaces it; a test
      reproduces it first.
- [x] **`Dock` measures `element.parentElement`.** That is an unwritten DOM
      contract on whatever the caller happens to mount it inside, and it cannot
      cross into `packages/ui` as it stands. Take the container as an explicit ref.

Keep `dock-model.ts` React-free and DOM-free — the five `dock-*.test.ts` files run
in the node environment and that is why the geometry could be tested at all.

## Answer

`4e3452f`.

**The defect reproduced exactly as written.** `opened` moved to `dock-model`
with its `String(...)` intact, and the first assertion against it failed with
`expected 'undefined' to be null` — so the claim was true and had never been
checked. `defaultLayout` is `uuidSchema.optional()`, so `?? null` is the fix and
`layoutId: LayoutId | null` is what stops the laundering coming back. Every
fixture this prototype ships declares a `defaultLayout`, which is why the
render's fallback to the first Layout had hidden it. The same laundering ran one
field over: deleting the selected Layout wrote `''` into the same field, and that
sentinel is gone with it.

`OpenEntry` was declared twice — once in the model, once in the story, structurally
identical and free to drift, with `editSelectedLayout` taking one and being handed
the other. Moving `opened` to the model is what made the failing test possible and
settles that duplicate at the same time.

**The groups follow `SpaceSidebar`'s**: `space`, `canvas`, `graph`, `cards`,
`persistence`, with `canvas` naming the Layouts and the one that is drawing exactly
as the sibling's does. `PrototypeCanvas` and `CommandDock` still take the whole of
`DockChrome`, standing where `App` and `SpaceSidebar` stand; everything below them
takes a group.

**Three of `03`'s five launders had to be adapted rather than left alone.** Branding
`onSelect`, `onActivate` and `onSwitchTo` makes `String(next)` unassignable at
`:1036`, `:1168` and `:1909`, and splitting `Chrome` renames those call sites anyway.
They now read the id back off the list the menu is drawn from — the row that was
picked answers for its own branded id — so no assertion was added and
`eslint-suppressions.json` is untouched. The `String(...)` is still there for `03` to
delete once `DropdownMenuRadioGroup` is generic; `:1213` (a colour) and `:2462`
(`dockSlot`, which takes `string` by design) were not touched at all.

`Dock` takes `container: RefObject<HTMLElement | null>`. `PrototypeCanvas` owns that
element, so the `overlay` prop went with the guesswork — a caller that supplies the
surface has to be the caller that supplies the frame.

**Evidence.** `pnpm verify`: static half green (toolchain, both typechecks,
`ui:catalog:check`, lint, anti-slop, format), `2 failed | 2202 passed | 2 skipped`
— the two failures are `current-domain-vocabulary.test.ts` against the untracked-by-
this-ticket `roadmap-analysis.md` at the repo root, pre-existing since `a1b07cd0`.
`pnpm e2e` and `pnpm e2e:ladle` were judged inapplicable: the change is confined to
`stories/review/` and `test/`, reaches neither `packages/app/src` nor `packages/ui`,
and no spec in `packages/app/ladle-e2e/` navigates to the Command Dock sheet.
