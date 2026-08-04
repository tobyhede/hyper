# Card gestures

Status: resolved

Decision: ADR 0036 — A card selects on click, and no click opens it.

## Problem Statement

A Card drawn in the graph answers one pointer gesture: a click opens it to read.
Every other card-level action has had to arrive as a control drawn on the Card
itself, and the Card is a 300px box already carrying a title, an optional
description, an alias marker, four authoring handles and — since `card-authoring`
— a title-edit affordance in its corner. That affordance is the immediate
complaint: a text button floating over a Card whenever the pointer passes it.

The obvious replacement, renaming on a double click of the title, cannot be added
beside click-to-open. A double click is two clicks, and the first one opens the
Card, so the second lands on a reading surface that has covered the graph. The
title has no pointer gesture available while a single click opens.

Separately, React Flow zooms the viewport on a double click and its filter
exempts only `.nopan` elements. A Card is not one, so double-clicking a Card
already zooms the canvas — today harmlessly, because nothing else answers the
gesture.

## Solution

Move opening to a double click and give the freed single click to **selecting**.
A double click on the **title** renames it in place and does not open the Card.
The corner affordance stays, on the same hover, selection and focus rules, but
becomes a small icon and is repointed: it **edits the Card**, opening the
description-and-Markdown surface that "Edit Card" already opens from inside an
opened Card. It is not a rename control. A pencil on a Card promises more than a
title, and the app already uses "Edit Card" for exactly this.

Selecting is not a new mechanism. React Flow already sets selection on click,
`[data-selected]` already reveals the authoring handles and the corner
affordance, and `F2` already renames "the selected Card". Selection is currently
an invisible side effect of opening; this makes it what a click is for, and
gives the graph a way to say *this one* without also asking to read it.

Renaming has two entry points, not three: the title's double click is the
pointer gesture and `F2` is the keyboard one. Both obey the rule that already
governs title editing — offered only when the graph is editable, nothing is open
over it, and it is not presenting.

The Card affordance is a third gesture for a different action, and it carries a
consequence the rename control did not: an Alias has no content editor, so the
affordance does not appear on one. An Alias is still renamed by its title's
double click and by `F2`, which is where an Alias's only authored field belongs.

Double-click zoom is turned off for the whole canvas rather than suppressed per
Card, so double click means one thing here and does not change meaning two pixels
away from a Card.

The keyboard path does not follow the pointer. `Enter` and `Space` on a focused
Card continue to open it, and that existing coverage is what proves the two
paths were decoupled rather than moved together.

## User Stories

1. As an author, I want a single click to select a Card without opening it, so that I can name the Card a gesture acts on without asking to read it.
2. As an author, I want the selected Card to be visibly selected, so that a click that no longer opens is not a click that appears to do nothing.
3. As a reader, I want a double click to open a Card, so that reading its content remains a direct pointer gesture.
4. As an author, I want a double click on a Card's title to rename it in place, so that the most common Edit is reachable without hunting for a control.
5. As an author, I want a double click on the title not to open the Card, so that renaming does not bury the field I am typing into.
6. As an author, I want the title rename to work without selecting the Card first, so that the gesture acts on the Card under the pointer.
7. As an author, I want double-clicking a Card not to zoom the canvas, so that opening a Card does not also move the view out from under it.
8. As an author, I want the Card affordance to be a small icon rather than a text button, so that a hovered Card is not covered by its own controls.
9. As a keyboard author, I want `Enter` and `Space` on a focused Card to keep opening it, so that the pointer change does not cost the keyboard path.
10. As a keyboard author, I want `F2` on the selected Card to keep renaming it, so that renaming has a keyboard gesture that needs no pointer.
11. As an author, I want the Card affordance to open the Card's editor rather than rename its title, so that a pencil on a Card promises what it delivers.
12. As an author, I want no Card affordance on an Alias, so that a control is not offered for content an Alias does not own.
13. As a screen reader user, I want the affordance to announce which Card it edits, so that replacing text with an icon costs no meaning.
14. As an author, I want a completed connection drag not to open the Card it ended on, so that authoring an Edge does not drop a reading surface over the graph.
15. As an author, I want leaving an invalid title not to open the Card underneath, so that a refused rename does not become a reading gesture.
16. As a presenter, I want every one of these gestures refused while presenting, so that presentation pointer input cannot select, open or rename.
17. As an author, I want dragging a Card, drawing an Edge and Alt-drop creation to behave exactly as before, so that the gesture change is confined to click and double click.

## Implementation Decisions

- ADR 0036 governs. Opening moves from React Flow's `onNodeClick` to `onNodeDoubleClick`; selection is React Flow's own and is not reimplemented.
- `zoomOnDoubleClick={false}` on the flow. Not a per-node `.nopan` exemption, and not a `stopPropagation` on each Card: double click has one meaning on this canvas.
- The title's double click begins editing and stops propagating, so it renames rather than opens. It obeys the same eligibility as the other two rename paths and needs no prior selection.
- `EditIcon` joins `packages/ui/src/icons.tsx` in that file's established style — 24×24 viewBox, `stroke="currentColor"`, `strokeWidth="1.6"`, `aria-hidden`. No `lucide-react` dependency: shadcn/ui takes its icons from lucide, this repo hand-rolls every one, and one more is cheaper than several hundred.
- The affordance keeps its place in the tab order and the three `stopPropagation` calls that keep its click, pointerdown and keydown off the graph beneath it. Its `aria-label` becomes `Edit Card <title>`, and with the glyph `aria-hidden` that label is the control's only accessible name.
- The affordance opens the Card straight into its editor rather than into its reading surface, or it would be a second way to do what the double click already does.
- It is not drawn on an Alias, which owns no content to edit. `card-authoring/03` — editing target content through an Alias — is unbuilt, and this does not build it.
- `.card--node` stops declaring `cursor: pointer`, which promised a click target that no longer exists.
- `connectionGesture`'s `setTimeout` is deleted and the flag is lowered where it is raised. The deferral exists only to hold the flag past the node click React Flow dispatches on the pointer-up ending a connection drag; a drag release produces a `click`, never a `dblclick`. The **flag itself stays** — the Alt-modifier listener and the empty-canvas hover tracking both read it, and neither concerns clicks.
- `titleEditInvalid` and the swallow-one-click rule are deleted. They exist because clicking away from a refused title opened the Card underneath; a single click no longer opens, and the ref has no other reader.
- Both deletions are consequences of the gesture change, not opportunistic cleanup. Neither is removed until the behaviour it protected is proven to hold without it.
- The keyboard is untouched: `Enter`/`Space` open a focused Card, `F2` renames the selected one.
- Presenting is untouched. Its existing refusals already cover every gesture here.

## Testing Decisions

- The two deleted guards are not left untested. Their tests are rewritten to assert the behaviour rather than the mechanism: a completed connection leaves the Card closed, and a refused title cannot open a Card.
- Prove the gesture change against the defect it fixes, not only against tests written after: double-click-to-rename must be shown unreachable before the open gesture moves, and reachable after.
- Every existing call site that opens a Card by clicking moves to a double click, across `packages/app/e2e/overview.spec.ts`, `packages/app/e2e/editing.spec.ts` and `openEditor()` in `packages/app/test/card-authoring.test.tsx`. Not every Card click in those files is an open — `editing.spec.ts` also clicks a Card to blur a refused title, and that stays a single click because leaving a field is what it tests.
- The `Enter`/`Space` open test in `packages/app/e2e/react-flow-integration.spec.ts` is not touched, and is the guard that the keyboard path did not follow the pointer.
- New unit coverage: a single click selects without opening; a double click opens; a double click on the title begins renaming and does not open; the title rename needs no prior selection.
- New browser coverage: a double click on a Card does not change the viewport transform; a rename completed through the double click persists and survives reload.
- `pnpm verify` and `pnpm e2e` before this is resolved. The e2e diff is expected and reviewable — it is the gesture change, and every changed line should be a click becoming a double click.

## Out of Scope

- Any gesture for the description or the alias marker. They are Card surface and open the Card, like the rest of it.
- Multi-select, marquee select, or acting on more than one Card at once.
- A context menu, or any other new affordance drawn on a Card.
- Deleting a Card, detached Card creation, undo and redo.
- Editing an opened Card's description or Markdown, which already works and is unaffected.
- Changing what opening shows (ADR 0011) or what presenting does (ADR 0024, 0027).

## Further Notes

The complaint that started this was the title-edit button being clunky, and the
icon answers that on its own — once it is pointed at editing the Card rather than
its title, which is the correction that arrived after the first build. The
gesture change is here because the alternative — keeping click-to-open and
letting an affordance and `F2` carry renaming — spends
the last cheap pointer gesture on the one action that already has a keyboard
equivalent, and leaves every future Card-level gesture with nowhere to go but
another control drawn on a box that is already full.

The cost is real and is not something the suite will report: single click is what
a person tries first, and opening will feel broken for a while. Run it before
calling it done.

## Comments

Superseded in part, within the same session. The open gesture decided here — a
double click on a Card's body — did not survive first contact: a Card centres
its title, so the centre of a Card *is* the rename target, and the two gestures
wanted the same pixels. Opening left the pointer entirely and became the Card's
own control. ADR 0036 was amended in place to record the decision actually
taken, which is why its title above no longer matches the one this spec was
written against.

The checklists below are left as they were ticked. They were true when this
effort resolved. What replaced them is `.scratch/opening-is-editing/` and ADR
0037 — read those for the current state.
