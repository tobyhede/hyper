# Every Resource kind is a module, and a Resource file is a JSON manifest

Status: accepted
Refines: 0020, 0120, 0127
Related: 0054, 0056, 0070, 0074, 0106, 0109, 0113, 0117, 0118, 0121, 0122

ADR 0120 made the content kinds, Markdown and Image, modules registered at composition, and kept Ur, Reference and Space as the domain's. **Every kind is now a module, those three included, and the domain names no kind.** The core of a Resource is its id, its Title and the id of its kind; everything else is the kind's. Not every kind is a content kind: Ur, Reference and Space are still not content kinds (ADR 0120), they are modules that are not.

## What it is

- **The document is an envelope.** A Resource document is `{ id, title, kind, content }`. `content` crosses the kind seam unparsed and only the kind's own schema reads it, which is what ADR 0120 asked of a content kind and is now true of every kind. An Ur Resource's `content` is empty. This is the shape of the stored document (each SQL row's `document`), of the HTTP payload and of the domain value, and it is the shape of a Resource file.
- **A Resource file is a JSON manifest.** Each Resource is one `resources/<id>.json` holding that envelope. Identity is inside the file and never its name, and the directory is still the inventory (ADR 0020). One JSON format serves every kind, so a file no longer claims to be Markdown when it is not one.
- **Content a kind keeps in a file is named by one locator.** A content kind describes a file of its content as `{ "path": …, "mediaType": … }`, or `{ "url": … }` for content outside the repository. Where a path may point is the kind's rule. A Markdown Resource's body is a **sidecar**: a plain Markdown file with no frontmatter, beside its manifest as `resources/<id>.md`, owned by that Resource and written and removed with it. An Image Resource's picture stays where ADR 0118 put it, content-addressed in the aggregate's `images/` and shared, or at an external URL. The locator is the file form; each kind's file codec maps it to and from the document's `content`, so a stored Markdown document still holds its source rather than a path.
- **`kind` is required.** A manifest that names no kind is refused at intake, as one naming a kind nothing registers already is (ADR 0120). Manifests are strict, as `space.json` and frontmatter are (ADR 0127): the core refuses a top-level key it does not own, and the kind refuses a key inside `content` it does not declare. Neither knows the other's keys.
- **Aggregate rules are the core's, from what modules declare.** A module answers its content's outgoing references, each typed as a Resource or a Space, and flags its kind: whether it may be a Target, and whether a Space it references lives by that reference. From those the core enforces, generically, that a Target exists and is not itself unable to be one (so referencing stays a single hop), that Space references form no cycle, that a Space lives while a reference holds it and dies with its last (ADR 0074), and that every ordinary Space is reached from the Meta Space. A module may add one narrow check of its own that only it understands, such as a Space Resource's Map and Graph resolving in its target Space. It never re-implements an aggregate rule.
- **Map rules that differ by kind are capabilities a module declares.** That only an Ur Resource takes a Shape (ADR 0121) and that it is never Open (ADR 0122) become flags the Ur module sets and the core reads. No Map rule names a kind.
- **ADR 0120's two halves stand.** A module's domain half (id, media types, content schema, file codec, content resolution, declared references and capabilities) is registered wherever intake runs; its view half only in the application.

## Delivery

Built in steps, each green on its own, recorded under `.scratch/resource-kind-modules/`: first the envelope document with no change in behaviour, then the registry with one kind moved per step (Ur, Image, Markdown, Reference, Space), and last the JSON manifests on disk. The envelope comes first because it is what the seam consumes, so no step writes code a later one throws away; the format on disk moves last, so authors meet one change.

## Prior art

**Frictionless Data Resource** is one JSON descriptor per resource, with a `profile` naming what kind of resource it is and exactly one of `path` or `data` locating its content; `kind` plays `profile`'s part here, and the locator is its `path`. **JSON Canvas** discriminates each node by `type`, with Markdown inline (`text`) or by `file` path. **OCI descriptors** address content by `mediaType` and digest, as a stored image is addressed by its SHA-256 (ADR 0106).

## Considered options

- **Keep Ur, Reference and Space as the domain's (ADR 0120 as written).** Rejected. The domain would still branch on three kind ids, and every rule they carry would stay a hand-written match rather than a declaration.
- **Give modules whole-aggregate validation hooks.** Rejected. Cycle, lifetime and rooting logic would move into kind code, where two modules could each enforce it differently. Declared references keep the invariants in one place.
- **A flat document, with the core reserving `id`, `title` and `kind`.** Rejected. Which fields are the kind's would be a convention, not a structure.
- **The envelope in the domain only, with flat frontmatter in files.** Rejected once the file became a JSON manifest: in JSON the nesting costs an author little, and one shape everywhere makes the codec close to a pass-through.
- **A Markdown body inline as a JSON string.** Rejected, as ADR 0020 rejected Markdown inside JSON: it diffs badly and edits worse, and loses every Markdown editor. **Both forms, chosen per file**, as Frictionless allows, is not rejected but not built: it can be added later without breaking a sidecar.
- **A missing kind means Ur (ADR 0120, ADR 0127).** Rejected. It is the one place the domain would still name a kind, and in a manifest the line it saves is `"kind": "ur"`.

## Consequences

ADR 0020's Markdown file with frontmatter becomes a manifest and a sidecar, so a Markdown Resource is two files. ADR 0020 rejected two files per card because the body was an orphan that could not say which card it was; a sidecar is named by its manifest's `path`, so the orphan is gone and only the second file remains, which is the cost accepted. ADR 0127's frontmatter strictness carries to the manifest, and its kind default is reversed. `.scratch/content-kinds/issues/02` is answered: no Resource file claims Markdown unless it is one. Every tracked Resource file, fixture and test rolls forward in the change that moves the format (ADR 0054), with `docs/aggregate-directory.md` and the `hyper-authoring` skill.
