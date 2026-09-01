# 31 August 2026 Space Cards architecture review — issue audit

Source: supplied architecture review “Hyper · Space Cards”, dated 31 August
2026. The review was checked against `main` at `e8d8f9cb` and the in-flight
`feat/space-cards-03` worktree at `1625117c`, including its current coordinated
Edit changes.

## Candidate disposition

| Review candidate | Issue | Disposition |
| --- | --- | --- |
| Deepen coordinated multi-Space Edits | none | Already in flight; do not create a competing issue or change its seam underneath the active work. |
| Make Meta lifecycle one deep module | architecture-review/12 | Release-critical design input for `v1-release/01` and `v1-release/08`. |
| Concentrate aggregate commit semantics | architecture-review/13 | Conditional: first prove adapter drift with a differential contract property. |
| Deepen Open Spaces composition | architecture-review/14 | Release-critical design input for Enter/Exit and persistence-safe switching. |
| Deepen Space aggregate topology knowledge | architecture-review/15 | Defer until a second production consumer appears. |

## Recommended release priority

### P0 — finish the in-flight coordinated Edit deepening

This remains the review's strongest recommendation and fixes an observed
freshness/data-loss defect at the seam every topology Edit uses. Do not start a
parallel refactor of the registry while it is moving. Review issues 12–15 are
blocked on the resulting interface where they touch it.

### P1 — design Meta lifecycle with `v1-release/01`, before `v1-release/08`

Promote architecture-review/12 into the implementation plan for
`v1-release/01`. Meta bootstrap, startup, locking and administrative replacement
are one invariant; letting 01 and 08 implement their halves separately would
make the later deepening more expensive and leave failure between them.

Recommended dependency order:

1. `space-cards/03` and its coordinated Edit deepening land.
2. architecture-review/12 fixes the Meta lifecycle seam.
3. `v1-release/01` builds bootstrap/startup through that seam.
4. `v1-release/08` reuses it for complete replacement/import.

### P1 — design Open Spaces before Enter/Exit implementation

Promote architecture-review/14 into the plans for
`entity-url-addressability/08` and `space-cards/12`. The release requires one
live session per Space and safe switching; bolting those rules onto URL handling
and `App.tsx` separately would preserve the implicit-registry defect the review
found.

`v1-release/07` should treat architecture-review/14 as part of the evidence for
its existing `entity-url-addressability/08` and `space-cards/12` blockers, not as
a separate late release-polish item.

### P2, conditional — aggregate commit semantics

Run architecture-review/13's differential property before Meta/import work
widens the two adapter implementations. If it finds an observable difference,
tag the issue `release/v1` and fix it before `v1-release/01` or 08 depends on the
decision. If both adapters agree over the generated domain, defer the refactor:
locality is valuable, but duplication alone does not outrank unfinished V1
capabilities.

### P3 — aggregate topology knowledge

Do not put architecture-review/15 on the release critical path now. Reassess it
while designing `v1-release/08` and Card-deletion confirmation. Promote it only
if either becomes a second consumer of inbound counts or deletion closure. This
keeps ADR 0074's reference-counting rule local without inventing a speculative
interface.

## Release-issue audit

| Release issue | Architecture action |
| --- | --- |
| 01 — Meta lifecycle | Must consume architecture-review/12; highest-priority new architecture work. |
| 02 — Cards drawer/Layout membership | No dependency on these candidates. Keep it independent. |
| 03 — Card lifecycle | Its Space Card create/delete operations depend on the in-flight coordinated Edit work; Open Spaces is not required for creation itself. |
| 04 — Layout management | No dependency on these candidates. |
| 05 — Graph management | No dependency on these candidates. |
| 06 — product design | Do not hide architecture work here; it consumes completed workflows. |
| 07 — release proof | Must prove the Open Spaces interface indirectly through its existing Enter/Exit and switching blockers. |
| 08 — aggregate round trip | Reuse architecture-review/12; trigger architecture-review/15 only if export needs topology facts. |

## Net recommendation

Prioritise architecture-review/12 and 14 with the release issues. Time-box 13
to its differential proof and promote it only on evidence. Leave 15 triaged but
deferred. This adds no new workstream for coordinated multi-Space Edits while
it is already in flight.
