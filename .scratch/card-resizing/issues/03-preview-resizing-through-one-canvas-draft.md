# 03 — Preview resizing through one canvas draft

**What to build:** Make an active resize a single transient canvas draft. As an
author drags, the resized Card, its Edges and every neighbour displaced by its
proposed Open Size move continuously from one draft-over-authored Placement.
Release commits the geometry already on screen; cancellation or Space
replacement restores the last authored canvas without producing an outcome.

**Blocked by:** 02 — Give every Open Card one resize control.

**Status:** resolved

- [x] The render adapter owns proposed resize geometry beside its existing
      projection and drag bookkeeping; Space Authoring receives only the final
      proposed Open Size.
- [x] One effective preview Placement drives the resized Card, neighbour
      displacement, handle geometry and Edges; no consumer locally patches a
      node while another reads authored geometry.
- [x] Preview displacement retains ADR 0064's derived `+x`/`+y` rule and never
      writes displaced coordinates into the Layout.
- [x] Pointer movement changes no Space and emits no intermediate Edit or
      persistence commit.
- [x] Release produces exactly one Edit and causes no second geometry jump when
      the authored projection replaces the draft.
- [x] Pointer cancellation, loss of the resize interaction, and replacement-epoch
      invalidation discard the complete draft and restore authored geometry.
- [x] Unit, application, and browser evidence cover live Card, neighbour and
      Edge geometry as well as completion and cancellation.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass at the branch head,
      with the real output recorded. All three pass — see "Verification status"
      below for the run, which covers the working tree rather than a committed
      state.

## Answer

The render adapter now owns one `ResizeDraft`: the Card id, final proposed Open
Size, and one Placement layered over the authored Placement. The application
renders that Placement through the ordinary positioned strategy and canvas
projection, so the resized Card, derived `+x`/`+y` neighbour displacement,
handles and Edges arrive in one published projection. React Flow's local
node-only dimension update is vetoed through `shouldResize`; pointer release
completes the final size once, while pointer cancellation, focus loss, unmount,
renderer selection and replacement-epoch invalidation discard the draft.
While that lifecycle is active, the Card rail and its buttons and the
Edge-authoring handles withdraw, leaving the resize control as the one visible
operation until the gesture ends.

Evidence is split across the render-adapter contract, the real
`SpaceCanvas`/`NodeResizeControl` lifecycle, `CardNode` loss/completion behavior,
and the browser gesture. The browser assertion observes the Card, Card B and an
Edge moving before release while the persistence revision stays fixed, then one
revision on release and full authored restoration after cancellation.

## Verification status

**One honest statement: the three suites have not been run against this branch's
head, and nothing below should be read as saying they have.**

The results this record used to present as "Final verification" were produced at
commit `b1e9289` (`Implement canvas resize draft preview`), which is the commit
that resolved this issue and is **not** the branch head. Since then the branch
has been rebased and four commits have landed on top — `7696913`
(`Contain canvas card background paint`), `09cd557`
(`fix: align resize story with rebased card state`), `e970c52`
(`refactor: consolidate card canvas stories`) and `c6cef6b`
(`fix: derive resize drafts from open placement`) — with further uncommitted work
in the tree. All four touch what this issue's evidence rests on — the Card
stylesheet and its contrast guard, the story and Ladle spec, the `CardNode` and
`SpaceCanvas` seams, and the render adapter's own draft derivation — so the
earlier numbers do not transfer. AGENTS.md forbids asserting a suite passed without having run it, so
they are recorded below as what they are — a superseded run — rather than
restated as the current result.

Superseded, kept for the record (commit `b1e9289`, pre-rebase):

- `pnpm verify` — reported passing; TypeScript 7.0.2 toolchain assertion, root
  and package typechecks, UI catalogue, ESLint, anti-slop, formatting and
  coverage all green.
- `pnpm e2e` — reported 113 passed (2.3m). That run first found four orphaned
  test-only Vite processes on ports 5304–5307 after an interrupted attempt;
  stopping those exact processes allowed the clean full run.
- `pnpm e2e:ladle` — reported 48 passed (14.4s).

### Branch-head result

Run against commit `c6cef6b` (`fix: derive resize drafts from open placement`)
plus the uncommitted review fixes in the tree — the resize control's layering and
reveal gate, the render adapter's `cardResize` capability, the stable `CardNode`
resize callbacks, the deleted unreachable `dimensions` clause, the Add Card gate,
the canonical `openSize` key order, and the `overview.spec.ts` presence sample.
The tree is not clean, so this is the result for the work as it stands, not for a
commit anyone can check out.

- `pnpm verify` — passed, exit 0. All eight gates ran in order: `typecheck:toolchain`,
  `typecheck`, `typecheck:packages`, `ui:catalog:check`, `lint`, `lint:anti-slop`,
  `format:check`, `test:coverage`. 155 test files, 1751 passed, 8 skipped.
- `pnpm e2e` — passed, exit 0. 115 passed (1.1m). No orphaned Vite processes this
  time; the ports the earlier run had to clear were free. The two tests over the
  superseded run are the Chromium touch proofs. `CardNode`'s resize callbacks are
  stable so React Flow cannot tear the gesture down mid-drag, and only a real
  browser can settle that — d3-drag keeps touch listeners on the control element
  while relocating the mouse pair to the window, so the two input paths fail
  differently and jsdom's synthetic `TouchEvent` speaks for neither. The second
  covers cancellation, which matters because `shouldResize` always returning
  `false` means React Flow's own `end` handler never runs: those three window
  listeners are the whole lifecycle, and a missed cancel leaves the gesture armed
  so the next unrelated pointerup authors a rect nobody released.
- `pnpm e2e:ladle` — passed, exit 0. 49 passed (12.8s). One more than the
  superseded run, and none of it from this review: the containment assertion
  added to `card-expand.spec.ts` sits inside the existing parity test, whose file
  still declares the same ten tests it declared at `c6cef6b`. The extra case came
  in with the story commits landed after `b1e9289`.

### A documentation inconsistency this reconciliation surfaced

Unrelated to the resize draft, but it bears on what `pnpm verify` asserts, so it
is recorded rather than dropped.

`AGENTS.md`'s `ui` package bullet says `MarkdownSourceEditor` "is reached from
`app` by dynamic import through `markdown-source-editor-lazy.ts` — the single
negated entry in the otherwise-barred `@project/ui/*` ESLint zone". **ADR 0067
retired that arrangement.** The lazy split moved into `ui` beside
`MarkdownCardBody`, and the ADR states outright that "the application import
restriction for `@project/ui/*` has no editor exception". `eslint.config.js`
agrees — the restricted group is a plain bar with no negated entry — and
`test/unit/ui-import-restrictions.test.ts`, which runs inside `pnpm verify`,
asserts that `@project/ui/MarkdownSourceEditor` is rejected from both `app`
composition and the React Flow adapter.

So the accepted ADR, the config and the test agree with each other, and the
agent-facing document disagrees with all three. The hazard is specific: an agent
following `AGENTS.md` would add the negated entry back to satisfy a sentence
nothing else supports, and `pnpm verify` would then fail on a test it had no
reason to expect. `AGENTS.md` is the file that needs the correction; nothing in
`eslint.config.js` or the test should move.
