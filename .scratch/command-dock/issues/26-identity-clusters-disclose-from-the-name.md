# 26 — Dock identity clusters disclose from the name; Rename is a menu command

**What to build:** Space, Diagram and Graph in the Command Dock all work the
same way. The name and the chevron are one disclosure: pressing either opens
that identity's list. Rename is a command in that list, not a click on the
name. Choosing Rename closes the menu and lands the caret in the name editor
already used for these identities. Escape, Enter and blur stay as they are.

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

**Tags:** release/v1

- [x] Space, Diagram and Graph share one behaviour. A press on the name or the
      chevron opens the ChoiceMenu for that identity. The three clusters are
      the same composition, not three treatments that happen to agree.
- [x] The list still chooses. New, Copy link and Delete stay where they are.
      Rename sits with those commands on the current identity.
- [x] Choosing Rename closes the menu and continues in the existing identity
      name editor. A refused draft stays open and editable. The Edit itself
      does not change — only how it is begun.
- [x] Compose `@project/ui`: the named ChoiceMenu trigger an Open Space Thing
      already uses, a DropdownMenuItem for Rename, and the identity name
      editor. Search the catalogue first. Do not add a second picker or a
      hand-rolled disclosure.
- [x] Things is unchanged. It names a set, not an entity, and has nothing to
      rename.
- [x] Clicking the name no longer begins a rename. Accidental edits from a
      missed chevron stop.
- [x] One Ladle proof and one application proof cover all three identities
      (ADR 0052). The story mounts the production Dock cluster, not a facsimile.

## Why

The name is a rename button and only the chevron opens the list. That inverts
frequency: authors switch far more often than they rename, but the large
target does the rare thing. Things already avoids the split — the whole
trigger discloses — because a set has no name to edit. An Open Space Thing
does the same: name and chevron are one ChoiceMenu. The three identity
clusters are the odd ones out.

`09` made the Space name a real Edit. This ticket does not reopen that. It
moves how the Edit is *started* onto the menu the cluster already has.

`18` reported a name click that also opened a Thing. It is still `needs-info`
and is not a blocker. Taking the name off the rename gesture removes the
click this ticket is about; it does not claim to settle `18`.
