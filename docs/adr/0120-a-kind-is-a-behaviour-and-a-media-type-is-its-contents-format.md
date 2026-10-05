# A kind is a behaviour, and a media type is its content's format

Status: accepted
Refines: 0113, 0114
Related: 0020, 0051, 0054, 0056, 0070, 0074, 0106, 0107, 0109, 0117, 0118

A Resource kind is a behaviour: it says what a Resource's content is, how it is stored, resolved, drawn and created, and which actions it adds (ADR 0113). A media type is the format of content. They are different things, so `kind` never holds a media type. A built-in id may share a word with one, as `image` and `markdown` do, without being one. A kind whose content has a format declares the media types it can hold and be created from, and creating a Resource from data an author brings — a dropped or pasted file — chooses the kind by that data's media type, `type/*` wildcards included.

Resource kinds are modules. A content kind is one module registered once at composition, as nondeterminism is (ADR 0109), and the domain holds no list of content kinds and branches on no content kind's id. Every content kind is registered at build time and compiled with the application. Nothing in the design may assume that stays true: a kind's content crosses the kind seam unparsed and is parsed by that kind's own schema, so a kind loaded at runtime would use the same seam with weaker static types, and kind ids are stable namespaced strings — the built-in kinds keep their bare ids (`markdown`, `image`, `ur`, `reference`, `space`) and any other kind takes a vendor id in the form `vnd.<owner>.<name>`, so a kind added later never collides with a built-in or forces a rename.

**Ur, Reference and Space are not content kinds.** An Ur Resource has no content: it is the Resource every capability belongs to (ADR 0113), and a content kind is what adds content to it. A Reference Resource's content is another Resource's (ADR 0070) and a Space Resource's content is another Space, whose lifetime it shares (ADR 0074); both take part in the aggregate's own validation. All three remain the domain's. An Ur Resource and every content kind, whatever is registered, can be a Reference Resource's Target.

**A Resource with no kind is an Ur Resource.** `kind` is optional, and a Resource file that does not declare one has no content: it is its id and Title, which is the common Resource ADR 0020 describes. A Resource file with no kind and a body is refused at intake, as an Ur Resource with a body already is, because a body is content that only a kind can say how to read. So the default names no content kind, and no author's writing is dropped by it.

A stored Resource whose kind is neither the domain's nor registered is refused at intake, as anything else intake cannot read is (ADR 0117). Every content kind is compiled from the codebase (ADR 0056), so a kind the build does not register is one nothing can store, resolve or draw.

## Prior art

Jupyter's renderer registry is the closest: renderers declare the media types they draw, register at build time or at runtime, and are ranked by preference. Its fallback that always applies is not taken: a kind nothing registers is refused, not drawn as something else. The MIME vendor tree (RFC 6838) is where the namespaced id comes from, and `type/subtype` matching is where creation by media type comes from.

## Considered options

- **The kind is a media type.** Rejected. One Image kind holds every picture format the browser draws, many media types with one behaviour: the host stores PNG, JPEG, WebP and GIF, ADR 0107 proposes SVG as a fifth, and an external URL already shows an SVG; an Ur Resource has no content and so no honest media type; a Space Resource and a Reference Resource point into the aggregate and are not formats. Each would need an invented `application/vnd.hyper.*` type standing for a behaviour, which is a kind under another name.
- **One kind per media type.** Rejected. A PNG Image Resource and a JPEG one behave identically, and the author would meet a different kind for each file they drop.
- **Keep the closed union of kinds.** Rejected for its cost. Adding the Ur Resource, a kind with no fields and no behaviour, changed 20 source files and 70 files in all, across `core`, `graph`, `react-flow-adapter`, `ui`, `app` and the Aggregate directory writer (`git diff --stat 292772aa^1 292772aa`, the merge of #333), because each layer matches on the kind by hand.
- **A missing kind means Markdown.** Rejected. It is today's default, and it names one content kind in the domain; a bare Resource is better described as having no content than as an empty document.
- **Require `kind`.** Rejected. It makes every author write a line for the simplest Resource, which has nothing for the line to choose.
- **Build runtime kinds now.** Not built. Nothing asks for them yet, and loading code the application has never seen needs sandboxing (ADR 0107's proposal to serve every stored image sandboxed is the precedent) and content versioning (MIME's `; version=` parameter is the precedent). The decision above keeps both possible without paying for either.

## Consequences

The Markdown and Image kinds become content kind modules, and the core loses its per-kind branches rather than moving them. A missing `kind` stops meaning `markdown`, so every tracked Resource file that relies on that default declares its kind in the same change (ADR 0054): `markdown` where a test needs its document, and otherwise `ur` with its body removed. ADR 0114 answers the per-content facts in one place by matching over every kind of content; for a content kind they become its module's to answer, so a new content kind fails to compile against the module's interface rather than at that match. A content kind module has a domain half, with its id, media types, content schema, Resource file codec, content resolution and first Open size, and a view half, with its front, presented form, icon and content actions. The domain half is registered on its own wherever intake runs — the application, the HTTP host, the CLI and every repository — and the view half only in the application, so domain logic stays out of React and nothing outside the application imports a view.
