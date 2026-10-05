# A kind is a behaviour, and a media type is its content's format

Status: accepted
Refines: 0113
Related: 0051, 0054, 0056, 0070, 0074, 0106, 0107, 0109

A Resource kind is a behaviour: it says what a Resource's content is, how it is stored, resolved, drawn and created, and which actions it adds (ADR 0113). A media type is the format of content. They are different things, so `kind` never holds a media type. A built-in id may share a word with one, as `image` and `markdown` do, without being one. A kind whose content has a format declares the media types it can hold and be created from, and creating a Resource from data an author brings — a dropped or pasted file, a picked file — chooses the kind by that data's media type, `type/*` wildcards included.

Resource kinds are modules. A content kind is one module registered once at composition, as nondeterminism is (ADR 0109), and the domain holds no list of content kinds and branches on no content kind's id. Every kind is registered at build time and compiled with the application. Nothing in the design may assume that stays true: a kind's content crosses the kind seam unparsed and is parsed by that kind's own schema, so a kind loaded at runtime would use the same seam with weaker static types, and kind ids are stable namespaced strings — the built-in kinds keep their bare ids (`markdown`, `image`, `ur`) and any other kind takes a vendor id in the form `vnd.<owner>.<name>`, so a kind added later never collides with a built-in or forces a rename.

**Reference and Space are not content kinds.** A Reference Resource's content is another Resource's (ADR 0070) and a Space Resource's content is another Space, whose lifetime it shares (ADR 0074); both take part in the aggregate's own validation. They remain the domain's, and every content kind, whatever is registered, can be a Reference Resource's Target.

A stored Resource whose kind is not registered is refused at intake, because the repository is the only source of state and every registered kind is in it (ADR 0054, ADR 0056). This is the rule while every kind is built in. If runtime kinds are ever built, ADR 0113 already says what such a Resource is: every capability is a Resource's, so it is still titled, placed, connected, Opened and presented, and it can be drawn as its Title alone, as an Ur Resource is.

## Prior art

Jupyter's renderer registry is the closest: renderers declare the media types they draw, register at build time or at runtime, and are ranked with a fallback that always applies. The MIME vendor tree (RFC 6838) is where the namespaced id comes from, and `type/subtype` matching is where creation by media type comes from.

## Considered options

- **The kind is a media type.** Rejected. One Image kind holds every picture format the browser draws, many media types with one behaviour: the host stores PNG, JPEG, WebP and GIF, ADR 0107 proposes SVG as a fifth, and an external URL already shows an SVG; an Ur Resource has no content and so no honest media type; a Space Resource and a Reference Resource point into the aggregate and are not formats. Each would need an invented `application/vnd.hyper.*` type standing for a behaviour, which is a kind under another name.
- **One kind per media type.** Rejected. A PNG Image Resource and a JPEG one behave identically, and the author would meet a different kind for each file they drop.
- **Keep the closed union of kinds.** Rejected for its cost. Adding the Ur Resource, a kind with no fields and no behaviour, changed 20 source files and 70 files in all, across `core`, `graph`, `react-flow-adapter`, `ui`, `app` and the CLI (`git diff --stat 292772aa^1 292772aa`, the merge of #333), because each layer matches on the kind by hand.
- **Build runtime kinds now.** Not built. Nothing asks for them yet, and loading code the application has never seen needs sandboxing (ADR 0107's proposal to serve every stored image sandboxed is the precedent) and content versioning (MIME's `; version=` parameter is the precedent). The decision above keeps both possible without paying for either.

## Consequences

The Ur, Markdown and Image kinds become content kind modules, and the core loses its per-kind branches rather than moving them. A content kind module has a domain half, with its id, media types, content schema, file codec, content resolution and first Open size, and a view half, with its front, presented form, icon and content actions. The domain half is registered on its own wherever intake runs — the application, the HTTP host, the CLI and every repository — and the view half only in the application, so domain logic stays out of React and nothing outside the application imports a view. A kind whose creation takes no input keeps its own Create command; creation that brings data is found by media type rather than by a command per kind.
