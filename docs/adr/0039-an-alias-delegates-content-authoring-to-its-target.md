# An alias delegates content authoring to its target

Status: accepted
Refines: 0037
Related: 0009, 0011, 0036

Opening an alias brings up the same surface every card opens on, filled with the content of the card it targets (ADR 0009's single hop, unchanged). Completing writes that target, so every occurrence of the content changes together — which is what an alias is for.

The **alias remains the opened context**. It is what the author clicked, and the surface says so: the pane names both cards, and each field it draws names the card that field authors. The alias keeps its own title and its own description on the graph; nothing here writes them, and nothing here exposes its target or its kind. Its title is authored inline on the graph like any card's (ADR 0036).

ADR 0037 collapsed reading into editing and recorded the consequence: an alias owns no content, so it had nothing to open, and with the reading surface deleted there was no way to look at what it pointed at either. That was accepted as temporary and named where it would return. This is that.

We rejected **redirecting** — opening the target *as* the target, so the pane says `A` and forgets `A′`. It is simpler and it loses the thing the author did: the pane would offer to rename a card they never clicked, while the title drawn where they clicked is the alias's and stays out of reach. An occurrence is not interchangeable with its content, or aliases would not need titles.

We rejected giving an alias content of its own. That is ADR 0009 reversed, and it ends the single source of truth that makes an alias worth having.

## What this costs

**One surface authors a card the author did not open.** Editing through `A′` changes `A` and every other occurrence of it. That is the point, and it is still a surprise the first time, so the delegation is stated three ways: a banner, the dialog's accessible name, and the label on every field.

**The delegated pane renames nothing.** The alias's title belongs to the graph and the target's title is not the alias's to change, so a title reached only through an alias is edited by opening the target itself.

**An alias's own description has no authoring surface at all.** The graph draws it, an import can write it, and the description field on this pane is the target's. That gap predates this decision and this decision makes it easier to walk into, because the field is now visible from the alias.

## The negative to remember

A future review will read a delegated pane that cannot rename what it shows and propose putting a title field on it. That field would author the target, from a surface reached through the alias, whose own title is the one on screen behind it — two cards' titles, one field, and no way to tell from the pane which is drawn where. If a delegated rename is wanted, it is the target's rename and belongs on the target.
