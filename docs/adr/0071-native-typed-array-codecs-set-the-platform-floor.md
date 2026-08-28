# Native Typed Array codecs set the platform floor

Status: accepted
Refines: 0069

Hyper pins Node 26.8.1. Its browser floor is any current evergreen browser that
natively implements the `Uint8Array` base64 and hexadecimal codecs; browser
versions without those codecs are outside the product contract. TypeScript
checks the ES2025 runtime library plus `ESNext.TypedArrays` as one deliberate
newer capability, while Vite's emitted-language tooling target remains ES2024.
Code may use those native codecs without a fallback or polyfill. This is a
narrow exception beyond ES2025 rather than permission to assume every future
platform proposal: another newer API has to justify its own floor.

ADR 0069's compact UUID representation makes this floor useful now. Its
canonical route codec operates directly on UUID bytes through
`Uint8Array.fromBase64`, `toBase64`, `fromHex` and `toHex`; it does not route
binary data through strings, import Node's `Buffer` into browser-safe code, or
add a compatibility implementation beside the platform one. PostgreSQL remains
17 and UUID generation remains unchanged — UUIDv7 and PostgreSQL 18 are a
separate decision, not part of representing an existing UUID in a URL.

The exact Node release is reproducible rather than a rolling `latest` alias.
Future upgrades are explicit maintenance even though the project deliberately
tracks the leading platform. The official Playwright image still supplies Node
24, so the E2E and Ladle jobs keep their exact image, browser binaries and
matching Playwright package while `actions/setup-node` overlays the repository's
pinned Node for test commands. Owning a derivative image was rejected: it would
add image publication and security-patch responsibility merely to replace a
runtime executable the existing action already installs.

Keeping ES2022 with a hand-written codec was rejected because it would preserve
a compatibility promise this development-only project does not need. Targeting
all of `ESNext` was also rejected because it would silently admit unrelated
future language and library features. ES2024 emitted syntax with the ES2025
library and the one named typed-array library records the actual contract:
TypeScript emits nothing, and Vite 6's esbuild does not yet recognise ES2025 as
a target label.
