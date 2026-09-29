# ADR log audit (2026-09-29)

Six agents analysed all 106 ADRs (82 live-status incl. rejected 0016, 24 superseded). Five read one README section each and classified every paragraph as LIVE (binds, current words), STALE-VOCAB (binds, retired words), OVERTAKEN (changed by a later ADR or the code) or HISTORY (narrative, rejected alternatives, costs). Code claims were checked with grep and reads. Word shares are reading estimates, ±10 points.

Files: `table.md` (one row per ADR), `all.json` (same, with each ADR's live decisions in current vocabulary), `<cluster>.md` (per-ADR detail, consolidated outline, drift), `approach.md` (method options and recommendation), `BRIEF.md` (the analysts' brief).

## Headline numbers

Live-status ADRs, word-weighted: 62.6k words.

| Group | ADRs | Words | Live | Retired words | Overtaken | History | Consolidated outline |
|---|---|---|---|---|---|---|---|
| Domain model | 21 | 18.3k | 17% | 23% | 21% | 39% | ~2.5k |
| Map and Graph | 16 | 13.2k | 28% | 21% | 14% | 37% | ~3.0k |
| UI | 16 | 13.4k | 29% | 15% | 11% | 44% | ~2.4k |
| Persistence | 16 | 9.4k | 43% | 6% | 9% | 42% | ~2.2k |
| Canvas, HTTP, toolchain | 13 | 8.3k | 40% | 7% | 9% | 43% | ~1.65k |
| **All** | **82** | **62.6k** | **29%** | **16%** | **14%** | **41%** | **~11.7k** |

By age (live-status only):

| ADRs | Count | Words | Live | Retired words | Overtaken | History |
|---|---|---|---|---|---|---|
| 0001–0040 | 25 | 14.4k | 16% | 18% | 22% | 44% |
| 0041–0080 | 31 | 22.0k | 28% | 20% | 16% | 36% |
| 0081–0106 | 26 | 26.2k | 37% | 12% | 9% | 43% |

Verdicts: KEEP 33, CONSOLIDATE 38, ARCHIVE 11, already superseded 24.

- ARCHIVE (little or nothing live, still marked accepted): 0002, 0005, 0007, 0015, 0016, 0038, 0039, 0046, 0048, 0085, 0092.
- CONSOLIDATE (live nucleus buried): 0001, 0003, 0004, 0009, 0010, 0014, 0018, 0020, 0024, 0027, 0028, 0030, 0033, 0036, 0040, 0041, 0044, 0047, 0054, 0064, 0065, 0068, 0069, 0073, 0074, 0076, 0077, 0081, 0082, 0084, 0086, 0088, 0089, 0093, 0095, 0096, 0097, 0101.

## Findings

1. Under a third of the live log states a live rule in current words. Old ADRs are noise through overtaken rules and retired vocabulary. New ADRs are bulky through recorded reasoning (history ~43% even in 0081–0106), which is a different problem.
2. A consolidated current-design set is about 11–12k words, under a fifth of the source.
3. Status blocks lag reality: 11 ADRs bind nothing but read as accepted.
4. Rename ADRs: 0092 is vocabulary only; 0085 keeps two small negatives; 0101 has a real nucleus (Map naming conventions, keep `kind`).

## Drift found (fix independently of any consolidation)

- Superseded ADRs cited outside `docs/adr` and `.scratch` (files): 0026 ×20, 0045 ×15, 0025 ×11, 0006 ×6, 0019 ×5, 0058 ×4, 0011 ×4, 0021/0055/0053 ×2, 0031/0072 ×1.
- Graph-id uniqueness across a Space (`validate.ts:118`) rests only on superseded 0045; live 0040 says Map-scoped.
- Rejected 0016 is cited ~20× as the rule "inject `newId` with no default"; no ADR states that rule.
- `current-domain-vocabulary.test.ts` says ADR 0085 chose Resource/Map; it chose Thing/Diagram (0101 chose Resource/Map).
- ADR 0101's promised `CONTEXT.md` changes never landed; its "no local named `map`" rule is broken in `product-destination.ts` and `snapshot.ts`.
- `CanvasContinuation.tsx:147` chains `.then(focus)` on `fitView`, which ADR 0043 forbids; `rendering.md` wrongly says every camera call lives in `cameras.tsx`.
- ADR 0033's "first Edge mints a Graph" is dead (`map-active-graph-required`) but still described in `edge-authoring.ts:591` and `rendering.md`.
- 0087 (centre vector) vs `rendering.md` (rect gap) disagree on the facing rule.
- 0104 says `reconnected-edge` is live; it is gone.
- 0077 and the README promise a CLI hard reset with `--force`; only `--dangerous-truncate` exists. README line for 0054 inverts its migration boundary.
- 0069: ~30% overtaken or unbuilt; its cross-Space presentation query value is neither implemented nor dropped by any ADR.
- `docs/agents/ui.md` still describes the deleted `ResourcePane`; `CONTEXT.md:112` still lists a creation pane.
- `docs/agents/editing-and-persistence.md:29` describes coordination 0097 replaced; `space-authoring.ts:1296` cites superseded 0058.
- `CONTEXT.md` says three layout strategies ship (two do) and presents unbuilt features as current (Reference Resources targeting Image Resources, image Replace, cross-Space Edges).
- Smaller: 0062's count (79/36 → 47/25), 0034 Node 24 (pin is 26.8.1), 0071 ES2024 target not set anywhere, 0081 names an old import, `grid.ts` still describes view conversion.

## Method (see `approach.md`)

Recommended: consolidating ADRs. A new next-numbered ADR restates one cluster's live decisions in current vocabulary, with "Do not" lines for rejected alternatives that still bind and a provenance table. Sources gain `Status: consolidated` / `Consolidated into: NNNN` and move to a frozen `docs/adr/consolidated/`; numbers never change, so code citations resolve in one hop. Requires a first ADR amending the append-only rule, plus tooling (status-block test, `knowledge-spaces.ts`, vocabulary scan over consolidating ADRs). Pilot on Map and Graph. Rejected: separate digests (a fifth unbound current-state layer), spec split, living ADRs, tombstoned stubs.
