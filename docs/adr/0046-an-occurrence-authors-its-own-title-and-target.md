# An occurrence authors its own title and Target from the pane it is opened in

Status: accepted
Refines: 0039
Refined by: 0048, 0049, 0051, 0070
Related: 0009, 0011, 0036, 0037, 0042

Opening an Alias still brings up the pane filled with the content of the Card it targets, and completing that editor still writes the Target — ADR 0039's single hop, unchanged. What changes is that the pane now draws two fields of its own above that editor: the occurrence's **Title**, and its **Target**. Both author the Alias. Neither touches the Card whose content is below them.

ADR 0039 said the opposite in two places. "The alias keeps its own title and its own description on the graph; nothing here writes them, and nothing here exposes its target or its kind," and, under what it costs, "**The delegated pane renames nothing.**" This refines both. The Target exposure went first, with retargeting; the Title followed.

## Why 0039's negative does not apply

0039 recorded the negative deliberately, and it is worth quoting in full because it is nearly this decision and is not:

> A future review will read a delegated pane that cannot rename what it shows and propose putting a title field on it. That field would author the target, from a surface reached through the alias, whose own title is the one on screen behind it — two cards' titles, one field, and no way to tell from the pane which is drawn where.

Every clause of that turns on **one field authoring the Target**. The field built authors the *occurrence*, which is the Card the author clicked and the one whose title is drawn where they clicked. The failure 0039 named — two Cards' titles contending for one field — is not reachable through a pane that draws two fields, labels each with the Card it authors, and names both Cards in a banner above them. 0039's own last sentence anticipates the distinction and rules on it: "If a delegated rename is wanted, it is the target's rename and belongs on the target." A delegated rename is still not wanted. This is the occurrence's rename, and it belongs on the occurrence.

## What forced it

Creation. An Alias created with an empty Title takes its Target's (ADR 0009), so the ordinary gesture leaves the Space holding two Cards called `B` — and leaves the author standing in the delegated pane, which under 0039 drew no Title field at all and whose visible fields belonged to the other one. The two names the author could tell apart were the two Cards they could not act on.

Sending them out to the graph's inline rename (ADR 0036) does answer it, and the created Alias is selected and at the visible centre, so the path exists. It is still the wrong path: it asks the author to leave the surface creation put them on, to undo the one thing creation just did to them. A pane an author is left standing in has to be able to correct what left them there.

## What this costs

**One pane authors two Cards, and only its labels say which is which.** The banner names both, the accessible name names both, and every field is labelled with the Card it writes. None of that is structural — a field added here without a label is a field authoring an unknown Card — and that is the standing cost 0039 identified, now paid by three fields instead of one.

**Rename and creation disagree about an empty Title, on purpose.** Creating an Alias with an empty Title takes the Target's; renaming one to blank is refused, with `A Card title is required.` They read as inconsistent and are not: creation has a Target in hand and a Card that does not exist yet, so an empty field is an author declining to choose a name. A rename is an author clearing one that exists, and there is nothing to infer from.

**An Alias's own description still has no authoring surface.** 0039's third cost is untouched. The description field on this pane is the Target's, and it is now the only field here that is.

## The negative to remember

Do not collapse the two Titles into one field, however tidy the pane looks with a single **Title** row — that is 0039's rejected design, and its reasoning stands undiminished. Do not give the rename creation's empty-Title fallback either: a rename that quietly re-took the Target's title would make the two Cards indistinguishable again, from the very control built to tell them apart.
