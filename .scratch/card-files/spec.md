# Card files: a card is one file

ADR 0020. A card becomes a single markdown file with frontmatter; the space file
keeps structure only.

Grilled and decided — the ADR carries the reasoning. What is left is sequencing,
and the sequencing matters because this touches the schema, intake, the dev-server
plugin, both space files on disk, and every test that builds a space.

## Shape

```
fixture/
  space.json        version, id, title, routes, layouts, defaultView
  intro.md          ← scanned
  cards/
    a.md            ← scanned
```

```markdown
---
id: a
title: A
description: Where every route begins
---

Card **A** is the entry point of the first collection.
```

An alias is the same file with `kind: alias`, `target: a`, and an empty body.

## Sequencing

**Read first, write second.** 01 and 02 land the format and can be verified on
reads alone: the fixture converts, the app boots, e2e is unchanged. 03 grows the
writer. Splitting them means a failure during the format change cannot be in the
writer, and vice versa.

**03 is what new-space is waiting on.** `new-space/02` and `/03` can build against
an in-memory space, but a minted space's card is described by no file, so a save
would persist a layout referencing a card that does not exist. The arc is not
honest until 03 lands.

## Not in scope

`markdownByCardId` and the `*Missing content file*` fallback disappear as a
consequence, not as a goal — the card carries its own body once it is one file.

The AGENTS.md rule that a card body must not start with a heading, and the e2e
test policing it, describe a hazard this removes. They come out in 02, when the
code stops having the hazard — not before.
