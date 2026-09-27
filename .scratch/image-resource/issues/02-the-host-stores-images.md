# 02 — The host stores images at /images/<id>

**What to build:** A store of images beside Spaces and outside the aggregate, shared across the repository, served by the host at `/images/<id>` (ADR 0106). `<id>` is the SHA-256 of the bytes, spelled as unpadded base64url. Storing is a POST to `/images` that answers the image's root-relative URL; storing the same bytes twice answers the same URL and stores them once. Accepted formats are PNG, JPEG, WebP and GIF, identified from the bytes rather than from the declared type, up to 10 MiB; each refusal carries a named code. GET serves the bytes with their media type and immutable caching. Images are never deleted. PostgreSQL, SQLite and the memory runtimes (including E2E's) each have the store. The route lives in `@project/http` and is not a product destination; name the store after what it holds everywhere — no "upload" identifier.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] POST of a PNG, JPEG, WebP and GIF each answer `/images/<sha256-base64url>`, and GET answers the same bytes and media type.
- [ ] Storing identical bytes twice answers the same URL and leaves one stored image.
- [ ] A file over 10 MiB, a file whose bytes are not one of the four formats (whatever its declared type), and an SVG each refuse with a named code.
- [ ] GET of an unknown or malformed id answers 404 or 400 respectively, without reading a Space.
- [ ] The shared repository contract covers the store for PostgreSQL and SQLite.
- [ ] `productAddress('/images/…')` is `outside`.
