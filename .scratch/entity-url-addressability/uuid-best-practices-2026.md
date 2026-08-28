# UUID best practices for Hyper — August 2026

## Decision in one sentence

Keep one UUID identity everywhere: PostgreSQL stores its native `uuid`, the
domain and APIs use canonical UUID spelling, and product routes reversibly
project the same 128 bits to one strict 22-character unpadded base64url value.

This matches ADR 0069 without creating a second identifier. The compact text is
an encoding at the browser-route boundary, not a new domain type, database
column, or generation scheme.

## Storage and generation

PostgreSQL's native `uuid` type stores the RFC 9562 128-bit value, accepts UUIDs
from any version, and always emits standard UUID text. It should remain the only
database representation; `text`, `char(22)`, `bytea`, and parallel compact-ID
columns would duplicate an identity and give up the database's native UUID
semantics. [PostgreSQL 18 UUID type](https://www.postgresql.org/docs/18/datatype-uuid.html)

For newly designed, write-heavy primary keys, UUIDv7 is the current
database-oriented default. RFC 9562 places its Unix-millisecond timestamp in the
most significant bits and says time-ordered UUIDs improve database-index
locality; PostgreSQL 18 provides native `uuidv7()` generation using a
millisecond timestamp, a sub-millisecond component, and randomness.
[RFC 9562 UUIDv7 and sorting](https://datatracker.ietf.org/doc/html/rfc9562#section-5.7)
[PostgreSQL 18 UUID functions](https://www.postgresql.org/docs/18/functions-uuid.html)
PostgreSQL describes the result as better indexing and read performance than
random UUID insertion. [PostgreSQL 18 press kit](https://www.postgresql.org/about/press/presskit18/)

That does **not** justify changing Hyper's generator or migrating existing IDs
in ticket 02. UUID versions coexist in PostgreSQL's one `uuid` type, and a UUID
version is a generation property rather than a different storage or routing
type. [PostgreSQL 18 UUID type](https://www.postgresql.org/docs/18/datatype-uuid.html)
A generator migration changes identity creation, test seams, deployment
requirements, and potentially where IDs are minted; it deserves its own
decision and evidence. Ticket 02 should encode existing IDs only.

UUIDv7 is not a secret. RFC 9562 explicitly says UUIDs must not be assumed hard
to guess or used as possession-based security capabilities, and notes that a
v7 timestamp exposes creation order. Authorization must protect every entity
regardless of UUID version or spelling.
[RFC 9562 security considerations](https://datatracker.ietf.org/doc/html/rfc9562#section-8)

## Product-route representation

A UUID is 16 octets in network byte order. RFC 9562 defines that byte order and
allows an application or presentation protocol to specify another textual
representation. [RFC 9562 UUID format](https://datatracker.ietf.org/doc/html/rfc9562#section-4)
Encoding those 16 octets with RFC 4648's URL-safe alphabet produces 22 useful
characters plus two predictable padding characters; RFC 4648 permits omitting
padding when the data length is implicit. It also requires zero-valued unused
pad bits for a canonical encoding.
[RFC 4648 base64url](https://datatracker.ietf.org/doc/html/rfc4648#section-5)
[RFC 4648 padding](https://datatracker.ietf.org/doc/html/rfc4648#section-3.2)
[RFC 4648 canonical encoding](https://datatracker.ietf.org/doc/html/rfc4648#section-3.5)

The route codec should therefore enforce all of the following:

1. Encoding accepts an existing schema-validated `UUID`, converts the 32 hex
   digits to the 16 UUID octets in left-to-right/network order, then emits
   base64url with padding omitted.
2. Decoding accepts exactly 22 characters from `[A-Za-z0-9_-]`; it rejects
   padding, the standard base64 alphabet, whitespace, aliases, and every other
   length.
3. Decoding uses strict final-chunk handling, requires exactly 16 bytes, and
   re-encodes those bytes to require byte-for-byte equality with the input.
   That last comparison rejects otherwise decodable spellings whose unused pad
   bits are nonzero, preserving one canonical URL.
4. The reconstructed canonical UUID is parsed by Hyper's existing
   `uuidSchema`. The codec must not maintain a second UUID regex or cast an
   unvalidated string to `UUID`.
5. Property tests cover canonical UUID round trips, compact-string round trips,
   mutations, invalid alphabets and lengths, and the noncanonical final
   character cases. Fixed examples alone are weak evidence for a bijective
   codec.

The idiomatic August 2026 JavaScript API is
`Uint8Array.prototype.toBase64({ alphabet: 'base64url', omitPadding: true })`
and `Uint8Array.fromBase64(value, { alphabet: 'base64url',
lastChunkHandling: 'strict' })`. These operations reached TC39 Stage 4 and the
specification defines both the URL-safe alphabet and strict trailing-bit
handling. [TC39 typed-array base64 specification](https://tc39.es/proposal-arraybuffer-base64/spec/)
MDN records them as Baseline 2025, available across current browser versions
since September 2025, while warning that older browsers may lack them.
[MDN `toBase64`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/toBase64)
[MDN `fromBase64`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/fromBase64)

Hyper currently declares ES2022 plus DOM rather than a Baseline 2025 browser
floor. The implementation should not silently raise that floor. Either make the
runtime/compiler-lib increase an explicit project decision, or keep one small
browser-safe compatibility implementation behind this codec. Do not use
`Buffer` in shared code: Node documents `Buffer` as its own binary API, whereas
the browser-facing packages must remain runtime-neutral.
[Node.js Buffer encodings](https://nodejs.org/api/buffer.html#buffers-and-character-encodings)
The web `atob`/`btoa` functions are widely implemented, but their binary-string
model is legacy in Node and Node directs new server code to typed binary APIs.
[Node.js `atob`/`btoa`](https://nodejs.org/api/globals.html#atobdata)

The official `uuid` JavaScript package is a credible alternative for UUID
text-to-byte conversion: it is cross-platform and exposes `parse()` and
`stringify()` with UUID hex pairs in left-to-right byte order. It is unnecessary
here unless Hyper already needs that package for broader RFC 9562 operations;
adding a dependency for two small conversions would compete with the existing
`uuidSchema` boundary rather than reuse it.
[uuid package API](https://github.com/uuidjs/uuid#api-summary)

## Human factors

The 22-character base64url form is machine- and URL-friendly, but it is not a
human name: it is case-sensitive and retains visually confusable characters.
The UI should display the entity title and offer copyable links; users should
not be expected to dictate or manually transcribe the compact ID.

ULID's canonical 26-character Crockford Base32 text is more transcription
friendly: its specification is case-insensitive and excludes `I`, `L`, `O`, and
`U` to reduce confusion. [ULID canonical specification](https://github.com/ulid/spec#canonical-string-representation)
But ULID also defines timestamp and randomness semantics, not merely a display
alphabet. Adopting it would introduce another identity scheme and contradict
ADR 0069's choice to encode each existing UUID's same 128 bits as unpadded
base64url. It is therefore not an alternative for ticket 02. If manual entry
ever becomes a real product requirement, that UX should be designed separately
around labels, search, short-lived pairing codes, or checksummed aliases rather
than changing durable entity identity.

## Assessment of the interrupted `product-routes.ts`

The direction is right—one reversible compact route projection—but the current
implementation should be replaced before it becomes a seam:

- `const UUID = ...` reimplements UUID validation beside `uuidSchema`. It can
  drift from the domain's accepted UUID set and makes `bytesToUuid` a second
  authority. Construct canonical text and parse it through `uuidSchema`
  instead.
- `atob`/`btoa` converts typed bytes through Latin-1 JavaScript strings. It is
  portable to the current browser and Node test environments, but it is not the
  modern typed-array API and Node labels it legacy.
  [Node.js globals](https://nodejs.org/api/globals.html#btoadata)
- Checking `^[A-Za-z0-9_-]{22}$` and a 16-byte decoded length is necessary but
  insufficient. A forgiving decoder can accept a final base64 digit with
  nonzero unused bits; without strict decoding or canonical re-encoding,
  multiple strings can address the same UUID, violating ADR 0069's one-route
  rule. RFC 4648 requires those pad bits to be zero.
  [RFC 4648 canonical encoding](https://datatracker.ietf.org/doc/html/rfc4648#section-3.5)
- `product-routes.ts` mixes the general UUID URL codec with one product route.
  The codec belongs beside the existing UUID schema/utilities in browser-safe
  core code so host routing and client routing consume the same implementation.
  Product route recognition can remain in the app/host routing boundary, but it
  should depend on that one codec rather than own it.
- The route result's discriminated union is a sound way to keep malformed input
  distinct from unrelated paths; retain that behavior while moving identity
  decoding behind the shared codec.

## Concrete recommendation for Hyper

For ticket 02, implement one `UUID` ↔ compact-route codec beside
`uuidSchema`, export only its narrow encode/decode operations, and reuse it in
both HTTP-host and client route resolution. Keep PostgreSQL columns as native
`uuid`, persisted documents and HTTP resources as canonical UUID text, and
base64url solely in product URLs. Require a canonical 22-character round trip,
prove the bijection with property tests, and leave UUIDv7 generation, existing
ID migration, aliases, and human transcription UX out of scope.
