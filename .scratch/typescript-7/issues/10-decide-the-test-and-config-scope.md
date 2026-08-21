# 10 — Test, e2e and config scope

**What to build:** Nothing. The baseline answers this.

**Status:** wontfix

**Why:** this ticket asked whether to exempt tests from `no-unsafe-type-assertion` wholesale (matching the existing `no-non-null-assertion` precedent), exempt only e2e and configs, or hold everything and clear all 51 sites.

Under ADR 0062 the question dissolves. The suppressions baseline covers production and test sites alike, on the same terms: what exists is recorded, nothing new is added anywhere, and entries drop out as files are edited. No exemption is needed, so none is written — which is the better outcome, because an exemption would have been permanent and this is not.

The reasoning that made the question hard is worth keeping, because it will come back the next time someone proposes a test-wide exemption for something:

`find(...)!` in a test fails loudly when the assumption is wrong, which is the stated basis for the existing non-null exception at `eslint.config.js:229`. `JSON.parse(text) as SomeShape` in a test does **not** — it produces a value shaped like a lie, and the assertions that follow may pass anyway. The distribution bore that out: the heaviest files were `test/unit/vite-space-http-plugin.test.ts` (10), `test/unit/import-space.test.ts` (6) and `test/unit/postgres-import-decoding.test.ts` (3), all of them parsing something. A blanket test exemption would have covered the parsing cases along with the harmless ones.

The dominant test pattern is separately interesting and not a defect: `expect(x).toBeInstanceOf(Y)` followed by `(x as Y).field`, because `toBeInstanceOf` does not narrow TypeScript's static type. Roughly 60 sites. `if (!(x instanceof Y)) throw` narrows properly and would remove them, but that is churn across 28 files for a pattern the runtime check already proves.

**Related:** the existing test-only non-null assertion exception is untouched and remains out of scope, as the source specification recommended.
