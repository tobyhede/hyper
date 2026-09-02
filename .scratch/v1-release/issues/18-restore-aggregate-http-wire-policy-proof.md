# 18 — Restore aggregate HTTP wire-policy proof

Status: resolved
Tags: release/v1
Blocked by: none

**What to build:** Restore the HTTP media, bounded-body and connection-reuse
contract coverage lost when commit moved from PUT on one Space resource to POST
on the aggregate collection.

- [x] POST `/api/spaces` accepts absent or UTF-8 JSON charset and rejects other
      charsets before request decoding.
- [x] Unsupported content encodings and media types receive the established
      status without reaching the repository.
- [x] Tests cover the exact one-MiB boundary, over-limit fixed and streamed
      bodies, the permitted drain, mid-drain overflow and connection reuse.
- [x] Media-type normalization and the route tree's implicit-HEAD behavior retain
      the portable Hono module contract.
- [x] The restored scanner covers the real Fetch application and socket host;
      it does not recreate the retired raw-Node handler.
- [x] `pnpm verify` passes with no smaller wire-policy surface than before the
      aggregate endpoint replaced the Space resource.

## Answer

The loss was confined to one file. `49c56fed` (*feat: build Space Card aggregate
lifecycle*) replaced `.put(SPACE_RESOURCE_PATH, …)` with
`.post(SPACE_COLLECTION_PATH, …)` and rewrote
`packages/http/test/space-http-app.test.ts` from 963 lines to 550 — 1020
deletions. `packages/http/test/media-type.test.ts` is byte-identical across the
move, and every `it` in `test/unit/vite-hono-host.test.ts` survived it, so the
socket host's drain-and-reuse proof was already POST-adapted and intact. The
restored scanner therefore covers the real Fetch application and the socket host
and recreates nothing of the retired raw-Node handler; no deleted module came
back.

**Charset and encoding, before decoding.** `POST /api/spaces` accepts a bare
`application/json`, `charset=utf-8`, and the three RFC 9110-legal spellings
Hono's own narrower json regex rejects; two more parameter forms the move
dropped — `x_1=2` and `foo="a;b"` — are back beside them, and each asserts the
change set the repository received rather than only the 200, because that is
what distinguishes the rewrite working from Hono handing the validator `{}`.
`Content-Encoding: identity` is accepted in either case; `gzip`, `br`, `deflate`
and a list naming `identity` beside another are 415. *Before decoding* is now
asserted rather than implied: an unsupported charset carrying a body that would
itself be refused — one past the size cap, one malformed — is still answered 415,
which fails the moment the middleware order inverts.

**Without reaching the repository.** Every wire rejection in the block runs
through one `wireRejection` helper that spies `commit` and asserts it was never
called. Nothing asserted that before; a policy producing the right status while
still handing the change set to storage would have read green.

**Sizes and the drain.** The exact 1 MiB boundary is driven through *both*
framings again — the declared-`Content-Length` arm was dropped with the move, and
it is the arm that fails when either `>` becomes `>=`. Over-limit fixed and
streamed bodies carry their `Send a request body no larger than 1048576 bytes.`
detail again, and the over-declared-length case names the decoder message it must
reach, so it can no longer pass on a guard that refused the request without
reading it. Two new cases split the drain in half: an honest overshoot inside the
allowance is pulled to its end, and a body that keeps arriving is stopped. The
stop is now bounded against `MAX_DRAINED_BODY_BYTES` — exported for it — rather
than the old 16 MiB literal, which was two whole allowances of slack.

**Connection reuse.** The host suite's `invalid path identity` case had regressed
to a bodyless `GET`, which is reused whether or not anything drained; it is a
body-carrying `POST` again. A new case pins the other half of the policy the
`MAX_DRAINED_BODY_BYTES` comment describes and nothing tested: a body past the
allowance leaves the request unconsumed and the socket is *not* reused.

**Route tree and normalization.** `normalizes the media type of every JSON
response` is back as a 16-case matrix over the aggregate contract, spanning
200/400/404/405/409/413/415/422/503 and distinguishing `application/json;
charset=utf-8` from `application/problem+json` — including the conflict and
aggregate-refusal arms, which encode whole documents and are not Problems. The
implicit-HEAD proof asserts `Allow`, `Cache-Control` and the empty body across
all three arms of `unservedContractPath` rather than only a status, the
invalid-identity judgement covers HEAD as well as an undeclared method, and the
`app.notFound()` recursion guard is driven over six off-contract paths again,
including the trailing slash an address bar produces.

**Two things beyond the bullets, both regressions the move left behind.**
`expectProblem` had lost its `type` and `title` assertions, so it checked only
status — and `invalid-request` and `invalid-space-id` share 400, meaning every
400 assertion in the file passed on the wrong guard's refusal. It asserts the
catalogued identity and `Cache-Control: no-store` again, which strengthens all 86
tests at once. And the per-guard `invalid-request` message cases were gone, so
the envelope decoder could lose a whole arm silently; eleven cases now name the
guard that must refuse them, beside the restored proof that a schema-invalid
snapshot answers in prose rather than Zod's serialized issue array.

The stale `PUT` default on `send` in `test/support/raw-http-request.ts` is now
`POST`. Every caller passes an explicit method, so it was unreached either way,
but it named a method the contract retired.

### Evidence

Eleven targeted mutations of `packages/http/src/index.ts`, each reverted, to prove
the restored tests bite rather than merely pass:

| Mutation | Failures |
| --- | --- |
| drop `drainRejectedBody` | 4 (both new drain cases, both host reuse framings) |
| `size >= MAX_COMMIT_BODY_BYTES` | 1 (the exact-boundary case) |
| media policy after body reading | 1 (the before-decoding case) |
| drop the canonical media rewrite | 5 (four media forms, plus the socket commit) |
| drop the HEAD guard | 3 (all three `unservedContractPath` arms) |
| drop `normalizeJsonMedia(context.res)` | 9 (incl. the response matrix) |
| rethrow a non-`Error` log failure | 1 |
| drain reads twice its allowance | 1 |
| drain stops at an eighth of its allowance | 2 |
| drain reads four allowances | 2 (incl. the new socket case) |
| HEAD always refuses instead of falling through | 3 (incl. the new fall-through case) |

`pnpm verify` passes: 171 files, 2096 tests, 2 skipped. `packages/http/src/**`
coverage is 99.29 statements / 94.96 branches / 97.5 functions against the pinned
98 / 94 / 96 — higher than before on every axis. `pnpm e2e` passes.

`space-http-app.test.ts` is 87 tests, against 31 `it` declarations covering the
same surface before this ticket and 963 lines before the aggregate endpoint
replaced the Space resource.

### Review round

A `/code-review` pass raised six findings, all taken.

The new socket test swallowed its first request's rejection outright, so a 500 or
a crash would have left both connection assertions true for the wrong reason; the
response is now captured and, if one arrived at all, asserted to be the 413. That
same test raced the host's socket teardown — a keep-alive agent holding one socket
will re-dispatch onto a connection the host has decided to drop but not yet
closed — so it waits for the destroy rather than assuming it.

The drain's upper bound had one chunk of headroom against the read-ahead actually
observed, not the "few" the comment claimed; the slack is eight chunks and the
comment says why a runtime detail should not decide the colour of the build.

Rewriting the HEAD block had dropped `HEAD /api/unknown` → 404, which is the only
case reaching `unservedContractPath`'s `return undefined` arm — the branch whose
comment says the HEAD guard must let an off-contract path fall through. It is
back as its own test; mutating the guard to refuse instead fails it and two
siblings, and nothing else.

The comment on the host's restored `invalid path identity` case claimed a
property the case does not have: no route matches, so `notFound` answers it
before the body reader is reached, and two bytes would be flushed before the
response regardless. The comment now says what the case actually holds.

`send`'s `method` is required rather than defaulted. An unreachable default is
how the retired `'PUT'` survived the endpoint move in the first place; every
caller already passed one, so requiring it costs an argument reorder and makes
the next contract change a compile error.

### Deliberately not done

`normalizeJsonMedia(unserved)` in `applyTransportPolicy`'s HEAD branch is dead:
`unservedContractPath` returns only `problem()` values, which are already
`application/problem+json`, so the `=== 'application/json'` guard never matches
and deleting the call would fail nothing. It is production behaviour, not test
coverage, and removing it is a separate decision — the HEAD assertions added here
pin the media type the branch does produce, so a future change to `problem()`
that made the call live would be caught.
