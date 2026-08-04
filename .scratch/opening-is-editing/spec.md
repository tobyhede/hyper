# Opening is editing

Status: resolved

Decision: ADR 0037 — Opening a card is editing it. Amends ADR 0036 — a card
selects on click, and no click opens it.

## Problem Statement

An opened Card has two states and they show the same thing. `CardRenderer` draws
the Markdown source in a `<pre>`; the editor draws the same source in a
`<textarea>`. Same content, same form, same order — the only difference is
whether the caret can enter. Around that non-difference sit an explicit "Edit
Card" action, a mode flag, a focus-restoration ref, and a reading surface whose
whole purpose is to be replaced.

Separately, the opened surface will not author a title, so a Card's title has
one authoring surface and its other fields have another.

And the gesture that opens a Card competes with the one that renames it. A Card
centres its title, so the centre of a Card — where a pointer goes — is the
rename target. Shrinking the title to the text it draws leaves opening a strip
above and below one line of text: tight on a one-letter title and gone on a real
one. A 300px box has no room for two pointer gestures that both want the middle.

## Solution

Collapse the two states into one editable surface, and take opening off the
pointer entirely.

The Card pane authors **title**, **description** and **Markdown source**, with
Cancel and Done. There is no reading state to enter first, no "Edit Card"
action, and no mode.

Opening is reached through the Card's own control — the pencil — and by `Enter`
or `Space` on a focused Card. Nothing a pointer does to the body of a Card opens
it. That leaves the title's double click uncontested, which is what makes
renaming on the canvas work at all.

The graph keeps inline title editing. It is what makes the graph a diagramming
tool rather than a list with positions: renaming a node in place is table
stakes, and routing it through a pane would cost an opened surface per rename.
The title is therefore authored in two places, which is safe because only one is
on screen — title editing is already withdrawn while a Card is open — and both
write the same Card document through Space Authoring.

An **Alias cannot be opened**. It owns a title and a pointer, not content, so
there is nothing for this surface to author; and with the reading surface gone,
looking at the content an alias points at goes with it. That capability returns
with `card-authoring/03`, which delegates an alias's content editing to its
target and is unbuilt. An Alias is renamed inline, like any Card.

Preview is not part of this. Rendered Markdown lives only in presenting (ADR
0011), and a preview surface changes that decision rather than extending it.

## User Stories

1. As an author, I want an opened Card to be editable immediately, so that reaching its content is not a step in front of the thing I came for.
2. As an author, I want to author a Card's title in its pane, so that its three authored fields have one home.
3. As an author, I want to keep renaming a Card on the graph, so that the common Edit costs no opened surface.
4. As an author, I want the two title surfaces to agree, so that renaming in either place is the same Edit.
5. As an author, I want no pointer gesture on a Card's body to open it, so that the title's double click is uncontested and renaming works anywhere on the canvas.
6. As an author, I want the Card's own control to open it, so that opening is discoverable without being a gesture I might trigger by accident.
7. As a keyboard author, I want `Enter` and `Space` on a focused Card to open it, so that the pointer change costs no keyboard path.
8. As an author, I want Cancel to leave the Card unchanged and close the pane, so that abandoning an edit is one action rather than two.
9. As an author, I want an unchanged Done to produce no Edit, so that opening and closing a Card has no persistence consequence.
10. As an author, I want an invalid title or description to stay local with an accessible error, so that the pane cannot submit a malformed Card.
11. As an author, I want one Done to submit one whole Card, so that title, description and body cannot persist separately.
12. As a presenter, I want no Card to open while presenting, so that presentation input cannot reach an editor.
13. As an author, I want an Alias to offer no pane, so that no control promises to author content an Alias does not own.

## Implementation Decisions

- ADR 0037 governs the surface; ADR 0036 as amended governs the gestures.
- `OpenCard` renders the editor and nothing else. `CardRenderer`'s use here, the "Edit Card" action, the `editing` flag, the focus-restoration ref and `initiallyEditing` all go.
- Opening and editing collapse into one path. `onOpenCard` is the only entry, called by the affordance and by `Enter`/`Space`; `onEditCard`, `editableCardIds` as an affordance gate and `editOnOpenCardId` reduce to whatever is still needed to keep an Alias out.
- `onNodeDoubleClick` is removed. The graph's body answers selection only.
- The title field validates as the graph's inline editor does — trimmed, non-empty — and reports its own accessible error.
- One Done builds one complete Card document and completes one `edited-card` Edit through Space Authoring, exactly as the description and body already do.
- An Alias offers no affordance and cannot be opened by keyboard either, so `editableCardIds` gates both paths rather than only the control.
- `CardRenderer` itself stays in `@project/ui`. It is presentation-agnostic and this is one caller; deleting a component because its only current caller stopped using it is a separate decision.

## Testing Decisions

- Prove the collapse against what it removes: an opened Card offers no action to begin editing, and its fields are editable on arrival.
- Title editing is proven equivalent across both surfaces — the same Card, the same validation, the same single Edit — rather than tested twice from scratch.
- The e2e that opens an Alias to read its target's content is removed, not adapted. It asserts a capability this decision withdraws, and adapting it would hide that.
- The `Enter`/`Space` open test stays and is the guard that the keyboard path did not follow the pointer off the Card.
- Playwright proves a title authored in the pane persists and survives reload, and that a Card opened while presenting is impossible.
- `pnpm verify` and `pnpm e2e` before this is resolved.

## Out of Scope

- Preview, and any rendered read outside presenting.
- Opening an Alias, or authoring content through one (`card-authoring/03`).
- Deleting Cards, undo and redo.
- Changing what presenting draws.

## Further Notes

The reading surface is being deleted because it showed the same bytes as the
editor, not because reading is unimportant. If a rendered read is wanted later,
that is a rendering feature with its own ADR against 0011 — not a restored mode.
