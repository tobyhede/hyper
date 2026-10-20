# 08 — PG Down Under goes live

Status: ready-for-human

**What to build:** the talk at `pgdu.tobyhede.com`, before 2026-10-30.

- Make `tobyhede/pgdu-2026-searchable-encryption-postgres-types` public. On 2026-10-19 `raw.githubusercontent.com` answered 404 for its `hyper.json`, which suggests it is private (inferred, not confirmed).
- The talk directory held 156 tracked files, about 1.4 MB, and no stored images, on 2026-10-19.
- Reshape the talk directory so the talk's Space is its Meta Space, with its diagram Spaces nested beneath it. Its `defaultMap` and that Map's `activeGraph` are then what the domain opens on. The `hyper-authoring` skill covers the files, and `pnpm hyper run` checks the result.
- In Cloudflare, create the Worker from 07 and add `pgdu.tobyhede.com` as its custom domain. Set its default location to `github:tobyhede/pgdu-2026-searchable-encryption-postgres-types@<sha>`, pinned to the talk's current commit.
- Rehearse once from a second machine, including the Notes window. Keep `pnpm hyper run` on the laptop as the fallback for a venue network failure.

**Depends on:** 07.

**Acceptance:** `https://pgdu.tobyhede.com/` opens on the talk Map with the talk Graph active, and presents end to end.
