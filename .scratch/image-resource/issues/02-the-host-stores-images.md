# 02 — The host stores images at /images/<id>

**What to build:** A store of images beside Spaces and outside the aggregate, shared across the repository, served by the host at `/images/<id>` (ADR 0106). `<id>` is the SHA-256 of the bytes, spelled as unpadded base64url. Storing is a POST to `/images` that answers the image's root-relative URL; storing the same bytes twice answers the same URL and stores them once. Accepted formats are PNG, JPEG, WebP and GIF, identified from the bytes rather than from the declared type, up to 10 MiB; each refusal carries a named code. GET serves the bytes with their media type and immutable caching. Images are never deleted. PostgreSQL, SQLite and the memory runtimes (including E2E's) each have the store. The route lives in `@project/http` and is not a product destination; name the store after what it holds everywhere — no "upload" identifier.

**Blocked by:** none

**Status:** resolved

- [x] POST of a PNG, JPEG, WebP and GIF each answer `/images/<sha256-base64url>`, and GET answers the same bytes and media type.
- [x] Storing identical bytes twice answers the same URL and leaves one stored image.
- [x] A file over 10 MiB, a file whose bytes are not one of the four formats (whatever its declared type), and an SVG each refuse with a named code.
- [x] GET of an unknown or malformed id answers 404 or 400 respectively, without reading a Space.
- [x] The shared repository contract covers the store for PostgreSQL and SQLite.
- [x] `productAddress('/images/…')` is `outside`.

## Comments

- The store is `ImageStore` (`packages/persistence/src/images.ts`), which `SpaceRepository` extends and `createSpaceHttpApp` takes beside `StoredSpaceRepository`; `admitImage` is the one admission rule, for the route now and for fixture seeding (07) later. The SQL table is `images` on both databases (`add_images` migrations), and neither aggregate lifecycle door reads or writes it.
- Refusal codes are Problem Details types: `image-too-large` (413), `image-format-unsupported` (415), `image-svg-unsupported` (415) and `invalid-image-id` (400). Storing answers `{ url }` with `Location`, 201 for new bytes and 200 for bytes already stored.
- GET serves the bytes with `X-Content-Type-Options: nosniff`, so a browser holds them to the media type admission decided and never renders them as anything else.
- The id format (`isImageId`) accepts only the canonical final base64url digit, matching ticket 01's `/images/<id>` URL rule in `@project/core`. The two are separate regexes until 01 and 02 meet on the integration branch; folding one into the other is left to that merge.
