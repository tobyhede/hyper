# 04: Sweep the vocabulary and arm the guard

**What to build:** The render-layer word is gone from everything this work left standing, and the naming guard holds every retired spelling so it cannot return unnoticed.

Navigation's selected-Layout field is spelled like the Active Graph id beside it in the same interface. The two Navigation operations that move between Layouts say Layout. The DOM attribute that marks a Layout row, and the test id that selects one, say Layout. The remaining identifiers across the app package follow.

Three names stay, because they are not ours or are not about Layouts: React Flow's edge-label renderer component and its own CSS class, and the function type that renders a React element into the page.

This ticket contains no behaviour change. A reviewer should be able to read it as a scan rather than a diff.

**Blocked by:** 02 and 03 (both delete identifiers this would otherwise rename twice).

**The behaviour-preservation guarantee changes shape here, and that is deliberate.** Tickets 02 and 03 leave every suite green *and unedited*, which is what proves them behaviour-preserving. This ticket renames a test id that four e2e specs select on, so those specs take selector-only edits. That is the cost of retiring the spelling; the evidence lives in 02 and 03. Do not weaken this to a rename that skips the test id — a spelling the guard cannot hold is a spelling that grows back.

**Status:** done

- [x] Navigation's selected-canvas field is renamed to match the Active Graph id spelling beside it, and its two Layout-moving operations are renamed
- [x] The render-layer id alias is deleted; every site names the core Layout id alias from ticket 01
- [x] The Layout row's data attribute and test id name a Layout, including the focus-restoration query that runs after an inline rename
- [x] **The e2e specs that select on the retired test id are updated — selectors only, no assertion or step changes.** Four of them use it, including the one that counts rows and the one that reads which row is pressed. This is the only suite this effort edits
- [x] The canvas-header component is renamed to name a Layout
- [x] The test id naming what is drawing the canvas is left alone — "canvas" is live domain vocabulary and the element genuinely names the canvas
- [x] **The Card-collection prop the canvas and Edge Authoring take is renamed.** It is spelled for the subject type ticket 03 deletes, and its own comment says so. Renaming it edits the canvas component test and the Edge Authoring React test — two files no other ticket touches, and both take prop-name edits only
- [x] The remaining identifiers across the app package are renamed. `App.tsx` alone carries fifteen distinct ones: the space variable, the resolved local and the resolver, the selection callbacks, the changed-selection predicate, the previous/next/initial selection locals, the adopted-destination helper, the drag bookkeeping field. Navigation, the projection and the composition each carry a parameter named for the deleted type — ticket 03 renames those with the retype; anything it left, this finishes
- [x] The Graph-membership helper and the resolved-selection accessor are renamed
- [x] React Flow's edge-label renderer, its CSS class, and the React render function type are untouched
- [x] **The parity claim naming "the current renderer" is left alone, on purpose.** Its id is a hyphenated tag shared by an e2e spec and the Ladle spec, so renaming it would edit the Ladle spec this effort promises not to touch, and its spelling is not one the guard reads. Say so where the three foreign names are recorded, so the next reader does not reopen it
- [x] The ADR 0055 naming guard's retired list gains every spelling this effort deleted, in the shapes they were written in — both the PascalCase and the hyphenated spellings of the row type, since the list matches literally
- [x] **The guard's negative self-test inverts, and one of its rules changes.** The block of lines the scan must stay *silent* on is a self-test of the pattern, not a claim about the tree — it is correct today and it is what breaks when the retired list grows. Four of its lines name spellings this effort retires and must move to the arm that asserts the scan *reports* them. The header component's name is currently matched as a whole identifier precisely so the longer name does not match; retiring the longer name means editing that rule, not adding a list entry
- [x] **`docs/agents/ui.md` is clean.** If ticket 02 corrected it, this only re-reads it; if anything survived, the scan will report it, because that document is inside the scanned tree
- [x] A repository scan for the retired spellings reports only the historical trees the guard already exempts
- [x] `CONTEXT.md` is unchanged — this effort introduces no concept
- [x] `SpaceApp.test.tsx` passes unedited — it selects only on the test id that stays
- [x] The Ladle Sidebar spec passes unedited
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green, each reported with real output

## Answer

Landed in `f000dde2`, after `9f58d2fa` (01), `e7cdc3eb` (02) and `e4728076` (03).

Two things went differently from the plan.

**Ticket 03 carried more renames than "shape, not names" implied**, exactly as the audit predicted. Deleting the aggregate retyped every parameter bound to it, and `CanvasRendererId` had to become `LayoutId` there rather than in 04, because the module holding the alias was the one being deleted. The substitution is type-identical, so nothing about it is a behaviour risk — but the clean line is "names the type change forces, then names it does not".

**Arming the guard immediately reported three stale documents**: `docs/agents/ui.md`'s Sidebar bullet, and two bullets in `docs/agents/editing-and-persistence.md` — one naming `continueInRenderer`, one describing `createRendererResolver` as though it still existed. The second was not in any ticket's list. This is the drift the ADR 0055 guard was added for, and it is the second consecutive rename where `docs/agents/ui.md` was the file left behind. The guard's own fixture had a stale line too: it pinned `unresolved-default-renderer` as a live error kind when the live kind is `unresolved-default-layout`.

`CardRenderer` survives in a `@project/ui` comment as a record of a component ADR 0037 deleted. It is not a spelling this effort retired, so it is not in the list and the scan does not report it.
