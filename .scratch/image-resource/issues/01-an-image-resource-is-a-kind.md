# 01 — An Image Resource is a kind

**What to build:** A fourth Resource kind, `image`, whose fields beyond `id`, `title` and `kind` are its image URL and an optional recorded natural size, `{ width, height }` in pixels, positive and finite (ADR 0106). The schema, the import variants and every intake accept it. The URL must be `https:`, `http:`, or the root-relative `/images/<id>` of a stored image; `data:`, every other scheme and every other relative form are refused with a named code. A Closed Image Resource draws its Title and the image kind treatment — a new `ResourceKindIcon` glyph — and no thumbnail. The aggregate round trip carries the URL and nothing else. No creation gesture yet: tests and fixtures build it directly.

**Blocked by:** none

**Status:** resolved

- [x] `kind: 'image'` with its URL field parses through the space-file, stored-document and import schemas, and `resource-document-equality.test.ts` holds them to one rule.
- [x] The natural size is optional and, when present, refuses a zero, negative or non-finite dimension.
- [x] A `data:` URL, a `javascript:` URL and a relative URL other than `/images/<id>` each refuse with the named code.
- [x] Both SQL stores and the memory repositories store and reload an Image Resource unchanged.
- [x] Export then Import of an aggregate holding an Image Resource round-trips its URL.
- [x] The Closed front draws the Title and the image glyph at the fixed Resource size; Ladle story and application proof (ADR 0052).
- [x] `CONTEXT.md`'s Image Resource entry and the kind list match what is built.

## Comments

- Built as `kind: 'image'` with `url` and an optional `naturalSize` in `packages/core/src/schema.ts`. A URL outside the rule refuses with `IMAGE_URL_UNSUPPORTED` (`image-url-unsupported`) through `isAcceptedImageUrl`; the stored-image form accepts only the canonical 43-character unpadded base64url spelling of a SHA-256 (the last character carries two zero bits).
- The aggregate writer carries `naturalSize` with the URL: it is a field of the Resource document, and dropping it would make Export then Import lossy. No picture bytes are written.
- `CONTEXT.md` needed no change: its Image Resource entry and four-kind list already match what is built.
- Adding the kind is a compile-time obligation in the Resources list, so it gains an Image Resources filter (and the Connect list a fourth kind toggle), empty until ticket 04 creates one.
- An Image Resource Opens through the shared operation and, until ticket 03, draws only its border and Title when Open. Create Reference is still offered on one and resolves no content until ticket 06.
