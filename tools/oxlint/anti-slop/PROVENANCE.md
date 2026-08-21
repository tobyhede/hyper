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

## Local modifications

Re-apply these when re-diffing against a newer upstream commit — each is
pinned by a test under `test/unit/anti-slop/`, so dropping one turns that
test red rather than going unnoticed.

- `rules/no-conditional-empty-object-spread.ts`: added a `JSXSpreadAttribute`
  visitor. Upstream only visits `SpreadElement` inside an `ObjectExpression`,
  so the same omission-behind-an-empty-object idiom reached JSX props
  (`<Foo {...(x ? {} : {y})} />`) unflagged. Pinned by
  `test/unit/anti-slop/no-conditional-empty-object-spread.test.ts`.

See `.scratch/anti-slop/research.md` and `.scratch/anti-slop/spec.md` for the
adoption decision and migration plan.
