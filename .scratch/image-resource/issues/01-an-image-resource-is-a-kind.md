# 01 — An Image Resource is a kind

**What to build:** A fourth Resource kind, `image`, whose fields beyond `id`, `title` and `kind` are its image URL and an optional recorded natural size, `{ width, height }` in pixels, positive and finite (ADR 0106). The schema, the import variants and every intake accept it. The URL must be `https:`, `http:`, or the root-relative `/images/<id>` of a stored image; `data:`, every other scheme and every other relative form are refused with a named code. A Closed Image Resource draws its Title and the image kind treatment — a new `ResourceKindIcon` glyph — and no thumbnail. The aggregate round trip carries the URL and nothing else. No creation gesture yet: tests and fixtures build it directly.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] `kind: 'image'` with its URL field parses through the space-file, stored-document and import schemas, and `resource-document-equality.test.ts` holds them to one rule.
- [ ] The natural size is optional and, when present, refuses a zero, negative or non-finite dimension.
- [ ] A `data:` URL, a `javascript:` URL and a relative URL other than `/images/<id>` each refuse with the named code.
- [ ] Both SQL stores and the memory repositories store and reload an Image Resource unchanged.
- [ ] Export then Import of an aggregate holding an Image Resource round-trips its URL.
- [ ] The Closed front draws the Title and the image glyph at the fixed Resource size; Ladle story and application proof (ADR 0052).
- [ ] `CONTEXT.md`'s Image Resource entry and the kind list match what is built.
