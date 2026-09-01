# 18 — Restore aggregate HTTP wire-policy proof

Status: ready-for-agent
Tags: release/v1
Blocked by: none

**What to build:** Restore the HTTP media, bounded-body and connection-reuse
contract coverage lost when commit moved from PUT on one Space resource to POST
on the aggregate collection.

- [ ] POST `/api/spaces` accepts absent or UTF-8 JSON charset and rejects other
      charsets before request decoding.
- [ ] Unsupported content encodings and media types receive the established
      status without reaching the repository.
- [ ] Tests cover the exact one-MiB boundary, over-limit fixed and streamed
      bodies, the permitted drain, mid-drain overflow and connection reuse.
- [ ] Media-type normalization and the route tree's implicit-HEAD behavior retain
      the portable Hono module contract.
- [ ] The restored scanner covers the real Fetch application and socket host;
      it does not recreate the retired raw-Node handler.
- [ ] `pnpm verify` passes with no smaller wire-policy surface than before the
      aggregate endpoint replaced the Space resource.
