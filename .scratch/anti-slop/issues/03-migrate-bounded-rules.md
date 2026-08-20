# Migrate the remaining bounded rules: chained assertions, shape-in-symbol-names, module mocking

Status: ready-for-agent

## Context

Three rules are bounded to a handful of files each, and mostly test code. After
issue 02 lands, remaining counts are:

- `no-chained-type-assertions` — 0 prod (issue 02 covers the only prod hit), 8
  test: `packages/graph/test/placement.test.ts` (3), `packages/app/test/render-adapter.test.ts`,
  `packages/app/test/renderer.property.test.ts`, `packages/app/test/cameras.test.tsx`,
  `test/unit/http-space-backend-failures.test.ts`, `packages/app/test/space-authoring.test.ts`
  (1 each).
- `no-shape-in-symbol-names` — 0 prod (issue 02 covers the only prod hits), 11
  test: `packages/core/test/card-document-equality.test.ts` (6),
  `test/unit/point-type-identity.test.ts` (3), `test/unit/postgres-import-decoding.test.ts` (2).
- `no-module-mocking` — 0 prod, 6 test, one hit each in
  `packages/ui/test/Button.test.tsx`, `packages/react-flow-adapter/test/CardNode.test.tsx`,
  `packages/react-flow-adapter/test/GraphHud.test.tsx`,
  `packages/ui/test/AddCardControl-base-ui.test.tsx`,
  `test/unit/export-space-recovery.test.ts`, `packages/app/test/cameras.test.tsx`.

None of these touch production code once issue 02 lands. Good next step for
momentum — cheap and zero prod risk — but `no-module-mocking` findings are
design feedback about test coupling, not free syntax fixes: `research.md`
explicitly says they "should be assessed as design feedback, not
grandfathered because the tests already exist."

## Direction

Fix `no-chained-type-assertions` and `no-shape-in-symbol-names` directly —
these are narrow, mechanical per-site fixes once the file is open.

For each `no-module-mocking` site, look at what's actually being mocked before
replacing the mock mechanism. If the module boundary being mocked is a real
seam the test should exercise for real (an in-memory implementation already
exists per `AGENTS.md`'s functional-core conventions), use that instead of a
mock. If it's mocking something with no real lightweight alternative, that's
signal the module needs a narrower interface, not just a different test
double — flag it rather than silencing the rule.

Enable `no-chained-type-assertions`, `no-shape-in-symbol-names`, and
`no-module-mocking` in `oxlint.config.ts` once each is clean.

## Caution

Don't treat `no-module-mocking` as a rename-the-import-style exercise. Six
sites is few enough to look at each individually.
