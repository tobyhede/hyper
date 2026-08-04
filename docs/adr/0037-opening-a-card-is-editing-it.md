# Opening a card is editing it

Status: accepted
Refines: 0011
Refined by: 0038
Related: 0006, 0020, 0024, 0035, 0036

Opening a card shows one surface, and that surface is editable. A markdown card opens on its **title**, its **description** and its **Markdown source**, all authored in place. There is no reading state to enter first and no action that turns reading into editing.

Its title is editable here *and* on the graph. Both write the same card through Space Authoring, and only one is ever on screen.

## Why the two modes collapsed

They were never two surfaces. `CardRenderer` drew the Markdown source in a `<pre>`; the editor drew the same source in a `<textarea>`. Same content, same form, same order — the only difference was whether the caret could enter. Around that non-difference sat an explicit Edit action, a mode flag, a focus-restoration ref, and a reading surface whose whole job was to be replaced.

ADR 0011 is why they looked alike: it removed the reading pane's Markdown *renderer* so a card could not read one way and present another, leaving opening to show source. That decision holds — source is still what a card opens on, and presenting is still the one place Markdown is drawn rendered. What does not survive is *read-only*. Once opening shows exactly what an editor shows, the reading state is a step in front of the thing the author came for.

## What this costs

**An alias cannot be opened.** It owns a title and a pointer, not content, so there is nothing for this surface to author — and with the reading surface gone, there is no longer a way to look at the content an alias points at. That capability does not move somewhere else; it goes, until `card-authoring/03` delegates an alias's content editing to its target. An alias is renamed on the graph, like any card.

**There is no rendered read outside presenting**, which is unchanged from ADR 0011 and is the thing a preview control would alter. Preview is not part of this decision. Adding it would put rendered Markdown back on a second surface — not a second *renderer*, since `CardContent` is the only one and a preview would use it, but a second place, which is what 0011 ruled on. It earns its own ADR or none at all.

## The negative to remember

A future review will read an editor that opens with no way to just *look* at a card and propose adding one back — a preview toggle, a read-only default, an "edit" action on the surface. That is this decision reversed, not extended: the reading surface was deleted because it showed the same bytes as the editor. If a rendered read is wanted, that is a different feature and a different ADR, and it is about *rendering*, not about restoring a mode.
