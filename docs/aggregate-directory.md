# The Aggregate directory

An **Aggregate directory** is the on-disk form of everything Hyper holds: every Space, rooted at the Meta Space, plus the pictures its Image Resources show. `pnpm start <dir>` runs one ([ADR 0117](adr/0117-running-serves-an-aggregate-directory-as-the-durable-copy.md)), and the `hyper` CLI Imports one into a database and Exports one back out. Exporting writes the same format whichever store it reads from.

The directory is plain files meant for git: JSON in a fixed key order, one Markdown file per Resource, and pictures named by their content. Exporting the same content twice writes the same bytes, so a diff shows only what changed.

```
my-talk/
  hyper.json                                     { "version": 1, "metaSpaceId": "2b1c9a40-…" }
  2b1c9a40-0f0e-4c55-9d3a-6f1d2e3a4b5c/          the Meta Space
    space.json
    resources/
      a0000000-0000-4000-8000-000000000001.md
      a0000000-0000-4000-8000-000000000002.md
  7e4f0d2a-3c1b-4a6e-8f9d-0a1b2c3d4e5f/          an ordinary Space
    space.json
    resources/…
  images/
    fZoCiTSlSs9w9S87nrFeaOkPdKB4wvFrbWfaMn23ZOs.png
```

The bundled example is [`packages/app/fixture`](../packages/app/fixture).

## `hyper.json`

```json
{ "version": 1, "metaSpaceId": "2b1c9a40-0f0e-4c55-9d3a-6f1d2e3a4b5c" }
```

It carries the one fact the directory cannot say for itself: **which Space is Meta**. Nothing infers that from ordering or naming ([ADR 0078](adr/0078-the-server-side-repository-owns-meta-lifecycle.md)), so a directory without `hyper.json` is not an Aggregate directory. A single Space's directory on its own, with `space.json` and no `hyper.json`, is refused. Both keys are required and no others are allowed.

There is no list of Spaces. A Space is in the aggregate because its directory is there.

## Space directories

Each Space is a child directory **named for the Space's Id, in lower case**, holding a `space.json`. The directory name is where the Space's Id is written. A name that is not a lower-case UUID is refused rather than read around, because a renamed directory would otherwise pass as a new Space on the next round trip. Where `space.json` also declares an `id`, the two must agree.

A child directory without a `space.json` is not a Space and is left alone.

### The rules that make Spaces an aggregate

- The Meta Space is the root. Every **ordinary** Space must be reached by some Space Resource in another Space; one that nothing reaches is refused (`ordinary-space-unreferenced`).
- A Space Resource's `map` and `graph` must name a Map of its target Space and a Graph that Map owns.
- Space Resources may converge on one Space but may not form a cycle, and a Space Resource may not target its own Space.
- Resource Ids are unique across the whole aggregate, not just within a Space.

## `space.json`

```json
{
  "version": 1,
  "id": "2b1c9a40-0f0e-4c55-9d3a-6f1d2e3a4b5c",
  "title": "Rust async",
  "maps": [
    {
      "id": "b0000000-0000-4000-8000-000000000001",
      "title": "Talk",
      "kind": "positioned",
      "positions": {
        "a0000000-0000-4000-8000-000000000001": { "x": 0, "y": 0, "open": false },
        "a0000000-0000-4000-8000-000000000002": {
          "x": 340,
          "y": 0,
          "open": true,
          "size": { "width": 480, "height": 320 }
        }
      },
      "graphs": [
        {
          "id": "b0000000-0000-4000-8000-000000000002",
          "title": "Main",
          "color": "#1f77b4",
          "headShape": "arrow",
          "edges": [
            {
              "from": "a0000000-0000-4000-8000-000000000001",
              "to": "a0000000-0000-4000-8000-000000000002",
              "title": "then"
            }
          ]
        }
      ],
      "activeGraph": "b0000000-0000-4000-8000-000000000002"
    }
  ],
  "defaultMap": "b0000000-0000-4000-8000-000000000001"
}
```

Every object here is **strict**: a key the format does not declare is refused rather than ignored, so a misspelt key fails loudly.

| Key | Meaning |
| --- | --- |
| `version` | Always `1`. Any other version is refused by name rather than migrated ([ADR 0040](adr/0040-layouts-own-card-membership-and-routes.md)). |
| `id` | The Space's Id. Optional here, because the directory name already carries it; if present it must match. |
| `title` | The Space's name. Non-empty. |
| `maps` | Optional. The Space's Maps, in order. A Space with none is given one the first time it is opened ([ADR 0079](adr/0079-v1-exposes-only-layouts-and-first-open-initializes-one.md)). Only the Meta Space can be written without Maps, because a Space Resource must name a Map of the ordinary Space it targets. |
| `maps[].id`, `.title` | The Map's Id and name. Map Ids are unique within the Space. |
| `maps[].kind` | `"positioned"`, the only kind. May be omitted. |
| `maps[].positions` | Resource Id → placement. **The keys are the Map's membership**: a Map may leave Resources out, and may not name one the Space does not hold. A placement is `{ "x", "y" }`, with an optional `open`, `size` and `shape`. `open` is `true` or `false`; absent means Closed, and an Ur Resource may not be Open. `size` is `{ "width", "height" }`, no smaller than the Closed Size (260×146) on either axis; absent means the Closed Size, Open or Closed. `shape` is one of `rectangle`, `pill`, `ellipse` or `diamond`; absent means `rectangle`, and only an Ur Resource may take another. |
| `maps[].graphs` | The Graphs this Map owns, in order, **at least one**. A Graph Id is unique across the whole Space, not just the Map ([ADR 0108](adr/0108-graph-identity-is-unique-within-the-space.md)). `color` is any CSS colour and `headShape` is one of `arrow`, `vee`, `dot`, `diamond`; both are optional. |
| `maps[].graphs[].edges` | Directed `{ "from", "to" }` Edges between Resources **this Map places**. Forks, merges, cycles and self-edges are allowed; an exact duplicate in one Graph is not. An Edge may carry a one-line `title`, and `"titleHidden": true` beside it. The list may be empty. |
| `maps[].activeGraph` | Which Graph is active when the Map opens. Absent means the first. |
| `defaultMap` | The Map the Space opens on. If absent, opening the Space records its first Map here. |

There is no Space-level list of Resources or Graphs. Resources are the Markdown files; Graphs belong to Maps.

## Resource files

A Resource is **one Markdown file**: YAML frontmatter, then, for a Markdown Resource, its content ([ADR 0020](adr/0020-a-card-is-a-markdown-file-with-frontmatter.md)). Resource files are found by scanning two places in a Space directory, **not recursively**: `*.md` beside `space.json`, and `resources/*.md`.

```markdown
---
id: a0000000-0000-4000-8000-000000000001
title: Why async?
kind: markdown
---

Futures are **lazy**.
```

A Resource's identity is its frontmatter `id`, never its file name. Exporting writes every Resource as `resources/<id>.md`, whatever its file was called before.

Every Resource has `id`, `title` and `kind`. The Title must have at least one non-blank line, and may run to several. The rest depends on the kind:

| `kind` | Further frontmatter | After the frontmatter |
| --- | --- | --- |
| `markdown` (the default when `kind` is absent) | — | The content, as Markdown. |
| `ur` | — | Nothing. An Ur Resource is its Title alone. |
| `image` | `url`: `https:` or `http:`, or `/images/<content-id>` for a picture in `images/`. Optional `naturalSize: { width, height }` in pixels. | Nothing. The Title is the image's text alternative. |
| `reference` | `target`: the Id of another Resource **in the same Space**, not itself and not another Reference Resource. | Nothing. It shows its Target's content, read-only. |
| `space` | `spaceId`, `map`, `graph`: the target Space and the Map and Graph it shows. Optional `framing: { centreX, centreY, zoom }`. | Nothing. |

## `images/`

The bytes of every stored picture the aggregate's Image Resources show ([ADR 0118](adr/0118-an-aggregate-directory-carries-stored-image-bytes.md)).

- Each file is `images/<content-id>.<ext>`. The content id is the SHA-256 of the file's bytes as unpadded base64url, and it is also the last segment of the Resource's `/images/<content-id>` URL. The extension is the format the bytes are: `png`, `jpg`, `webp` or `gif`. The same picture always has the same name, so it is stored once however many Resources show it.
- To add a picture by hand, compute its name and copy it in:

  ```sh
  id=$(openssl dgst -sha256 -binary picture.png | base64 | tr '+/' '-_' | tr -d '=')
  cp picture.png "my-talk/images/$id.png"   # then use  url: /images/<id>  in the Resource
  ```

- Importing admits every visible regular file in `images/` by the rule an upload uses: the format is read from the bytes, and a file is at most 10 MiB. A file that is not such an image, or is **not named for its own content**, refuses the whole directory.
- A Resource whose `/images/<content-id>` has no file in `images/` is allowed. It draws as a picture that will not load.
- An `https:` or `http:` URL stays a URL. Hyper does not download it, and nothing is written to `images/` for it.
- Exporting owns the image files in `images/`: a picture no Resource shows any more is removed, and an `images/` left empty is removed. Dotfiles, subdirectories and links inside `images/` are left alone.

## Which Ids may be left out

A hand-written directory may omit these, and Importing mints them:

- a Space's `id` in `space.json` (the directory name supplies it);
- a Map's `id`, and a Graph's `id`;
- a Resource's frontmatter `id`.

**A minted Id cannot be referred to**, because nothing in your files knows it. So write the Id of anything another file names: a Resource that a Map positions or an Edge joins, a Map named by `defaultMap` or a Space Resource's `map`, a Graph named by `activeGraph` or a Space Resource's `graph`. A reference to an Id nobody declares is refused.

The next Export writes every minted Id into the files.

## What Exporting replaces, and what it keeps

Exporting writes the directory **in place** ([ADR 0119](adr/0119-export-writes-in-place-and-git-answers-for-a-partial-write.md)). It owns exactly what Importing reads, and never reads, copies or touches anything else:

- **Owned:** `hyper.json`; each Space directory's `space.json`, every `*.md` beside it and every `resources/*.md`; the image files in `images/`.
- **Kept:** any other file or directory, at the root or inside a Space directory, such as `.git`, a `README.md` at the root, notes in a `notes/` directory or a `.gitignore`.

One write goes like this:

1. Every file the aggregate serialises to is computed in memory and checked the way Importing would read it. If it would not read back, nothing is written.
2. A file whose bytes are already on disk is left alone, so an unchanged file keeps its timestamp. Every other file is written to a dot-prefixed temporary file beside it and renamed over it, so no file is ever half-written.
3. Each owned file the aggregate no longer has is removed: a removed Resource's file, a `*.md` beside `space.json`, a picture no Resource shows, the files of a Space that is gone. A directory that removal leaves empty is removed too, so a gone Space's directory disappears unless it holds files of yours.

The directory itself, and each Space directory in it, is never renamed or recreated, so a shell or editor open inside one keeps working. A missing directory is created. Exporting refuses to write or remove anything through a symbolic link.

**There is no whole-write atomicity, backup or recovery copy.** A crash in the middle of a write can leave some files new and some old. Keep the directory under git: git restores it.

**Markdown beside `space.json` is not kept.** A `README.md` or any other `*.md` in a Space directory or its `resources/` is read as a Resource file: it is either Imported as a Resource or, without valid frontmatter, refuses the directory. Either way the next Export removes it. Keep prose about a Space under a name or directory Hyper does not scan.

## How a directory is checked

Two layers:

- **Shape.** Zod schemas in `@project/core` check `hyper.json`, each `space.json` and each Resource's frontmatter.
- **References.** `@project/graph` checks that every Edge, placement, `activeGraph`, `defaultMap` and Reference Resource `target` resolves inside its Space, that there are no duplicate Ids or duplicate Edges, and then the aggregate rules above across Spaces.

`pnpm start` and `pnpm hyper` print what they refuse and exit non-zero. A file that cannot be read is named by its path; a broken reference is named by its Space and the Ids involved. Reading comes before the reference checks, so fixing the first round of problems can reveal a second.

## Durable URLs and HTTP resources

Every addressable entity has a durable product URL built from its UUID. Product URLs encode UUIDs as unpadded 22-character base64url values; titles never take part in identity. A URL may name an entity canonically or add the Map and Graph context needed to reopen the same canvas, or the Active Resource while Presenting:

| Product URL | Destination |
| --- | --- |
| `/spaces/:spaceId` | Space |
| `/spaces/:spaceId/resources/:resourceId` | Resource, using the Space's current Map when it contains the Resource |
| `/spaces/:spaceId/graphs/:graphId` | Graph in its owning Map |
| `/spaces/:spaceId/maps/:mapId` | Authored Map |
| `/spaces/:spaceId/maps/:mapId/resources/:resourceId` | Resource in an explicit Map |
| `/spaces/:spaceId/maps/:mapId/graphs/:graphId` | Graph in an explicit Map |
| `/spaces/:spaceId/maps/:mapId/graphs/:graphId/present/:resourceId` | Presenting at its Active Resource |

These are navigation addresses, not persistence resources: resolving one never edits a Map, Active Graph or Resource. The browser and the Node host share one destination contract, so a malformed address receives `400`, an unresolved entity `404`, and a direct request returns the same application destination client-side navigation opens ([ADR 0069](adr/0069-entities-have-durable-web-addresses.md)).

The JSON API is smaller and keeps UUIDs in canonical spelling:

| HTTP resource | Purpose |
| --- | --- |
| `GET /api/spaces` | List the stored Spaces |
| `POST /api/spaces` | Commit a change set: each change names a Space, its complete next snapshot and the revision it was made against |
| `GET /api/spaces/:uuid` | Load one Space snapshot and its revision |
| `GET /api/aggregate` | Load the complete aggregate |
| `POST /images` | Store a picture; the body is the image's bytes |
| `GET /images/:contentId` | Read a stored picture |

Resources, Maps and Graphs are parts of a Space, so they have product URLs but no persistence endpoints of their own. API failures use RFC 9457 Problem Details (`application/problem+json`).
