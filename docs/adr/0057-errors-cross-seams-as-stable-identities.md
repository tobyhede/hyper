# Errors cross seams as stable identities

Status: accepted
Refines: 0042
Refined by: 0068
Related: 0030, 0048, 0056
Build status: not built

An expected failure has a stable machine identity and typed context at every
interface it crosses. Space Authoring's `refused` result therefore carries a
closed discriminated `AuthoringRefusal` rather than display prose: each variant
has a stable `code` and only the domain values needed to describe that
condition. A Card title refusal may identify `card-title-required`; a stale
Target may identify `alias-target-not-found` with its `targetId`. The domain
does not name a form field, HTTP status or translated sentence.

The application maps that identity to the surface conducting the interaction.
It owns wording, field attribution and recovery: correctable input is attached
to its `Field`; a broken invariant still throws; and an accepted Edit closes its
dialog without waiting for persistence. Retryable persistence failure,
permanent rejection and revision conflict remain the workspace's three
existing states and are not duplicated inside the editor that produced one of
the coalesced snapshots.

HTTP error responses use RFC 9457 Problem Details and
`application/problem+json`. The problem `type` is the stable wire identity;
`title` and `detail` are prose and no consumer branches on them. A problem type
may add structured extension members, including an `errors` collection whose
entries carry stable codes, typed values and RFC 6901 JSON Pointers into the
request where location is useful. The HTTP adapter decodes that envelope once
into `CommitResult`; domain and application modules do not depend on Problem
Details. The optimistic `409` conflict response may continue carrying the
current `LoadedSpace`, because that representation is the recovery value rather
than an explanation of an error.

We rejected keeping `{ reason: string }` and `{ message: string }`: both make
English copy part of a programmatic interface and force callers and tests to
parse or pin it. We rejected putting `field` on a refusal because a field is a
fact about one presentation, not the domain rule. We also rejected one generic
error envelope spanning domain, application and HTTP; translating once at each
seam keeps each module's interface in its own vocabulary.

The accepted cost is an explicit catalogue and exhaustive mappings. Adding or
changing a refusal code changes the Authoring interface deliberately; domain
tests assert codes and typed context, presentation tests assert placement and
copy, and HTTP contract tests assert problem types and decoding. This is a
roll-forward protocol change under ADR 0056, so the existing prose-only wire
shape receives no compatibility decoder.
