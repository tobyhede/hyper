# 02: The Space Sidebar takes Layouts

**What to build:** The Space Sidebar draws Layouts. Today it is handed a row type invented for it — a pair of fields copied off a Layout — built by a module whose two functions are a map and a find with one caller each. The find re-locates a Layout that has already been resolved, and row identity is compared through a function that is the identity function on a UUID.

After this ticket the Sidebar receives the Space's Layouts and the Layout that is drawing, `App.tsx` passes the Layout it is already holding, and a row is the selected one when its Layout id equals the selected Layout's id.

Nothing a person sees changes: the same rows in the same order, the same Add Layout, the same inline rename, the same delete refusal, the same focus returning to the row after a rename.

**Blocked by:** 01 (the new props name a Layout id, and must not spell the alias ticket 04 deletes).

**Runs beside 03, not clear of it.** Both tickets edit the Sidebar story fixture and the story-Space test named below. Whichever lands second rebases on the first; neither may assume the file it opens is unchanged.

**Status:** done

- [x] The Sidebar's canvas props carry the Space's Layouts and the selected Layout, in place of the derived row collection and current row
- [x] The Sidebar's entity union carries a Layout where it carried a row, in both of its arms
- [x] The canvas-header component that names what is drawing takes a Layout
- [x] `App.tsx` passes the already-resolved Layout; nothing re-finds it by id
- [x] The row-projection module is deleted, along with the row type, the row collection type, the derivation and the find
- [x] The key function is deleted; row identity is a direct comparison of Layout ids. The prop comment explaining why identity was compared by key rather than by object is rewritten to state the surviving rule
- [x] The Sidebar test that pins "an equal row built by a second derivation still presses" survives, retargeted at the direct comparison, with its docstring rewritten to name the surviving rule rather than the deleted mechanism
- [x] The deleted module's test file is removed; anything it proved that is still true moves to the surviving Sidebar or resolution tests
- [x] **The story-Space test is rewritten.** It is a second consumer of the deleted derivation and find — it asserts where each story Space opens by reading the current row's title — and it must ask the Space for the Layout instead. It is not the deleted module's own test file and is easy to miss
- [x] Sidebar story fixtures compose the new props
- [x] **`docs/agents/ui.md` is corrected.** Its Sidebar bullet is the read-before-touching authority for this surface and it names the derivation, the find and the header component by their current spellings. Leaving it is the exact drift the ADR 0055 guard was added to catch, and ticket 04 cannot go green while it stands
- [x] `SpaceApp.test.tsx` passes unedited
- [x] The Ladle Sidebar spec passes unedited
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green, each reported with real output. The e2e suites are unedited in this ticket — the selector rename is ticket 04's
