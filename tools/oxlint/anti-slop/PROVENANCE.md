# Provenance

Vendored from https://github.com/dmmulroy/anti-slop at commit
`6d538555cb151d4121ed51a27db81890eacf8ae9`.

Copied: `src/index.ts`, `src/rules/*.ts` (rule implementations only, upstream's
own `*.test.ts` files excluded), `src/shared/*.ts`.

Not copied: `src/effect/**` (the opt-in Effect rule — Hyper does not depend on
`effect`, per the upstream install skill's guidance to only add it on an
explicit dependency or request).

Upstream has no tags or releases, so this is a pinned-commit vendor rather
than a versioned dependency. Upgrading means re-diffing this directory against
a newer commit by hand.

See `.scratch/anti-slop/research.md` and `.scratch/anti-slop/spec.md` for the
adoption decision and migration plan.
