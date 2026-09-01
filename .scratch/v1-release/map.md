# Chart the V1 source release

Status: resolved
Tags: wayfinder:map, release/v1

## Destination

A decision-complete, executable release plan for Hyper `v1.0.0`: a tagged and
documented source milestone that a technical author can run locally and use to
author, persist, reopen, present, export and import a multi-Space technical
presentation without editing source files or understanding the stored format.

## Notes

- Use `grilling` and `domain-modeling` for decision tickets. Planning is this
  map's work; implementation stays in the existing release and feature tickets.
- The current [V1 Definition of Done](definition-of-done.md) is the scope
  baseline. Reopen it only where a contradiction, missing proof or canonical
  journey blocker requires a decision.
- **End-to-end** is an untagged early checkpoint for observed use and feedback,
  not a release identity. `v1.0.0` is the later tag after the complete release
  gate passes.
- The canonical journey is: install and launch Hyper; begin in the permanent
  Meta Space; use Markdown, Alias and Space Cards; arrange Cards through Layouts
  and Graphs; save and reload; present; export; hard-reset; import; and recover
  the same authored result.
- On first repository initialization, the Meta Space's top-level Layout receives
  deterministic, editable **Default Content**. It contains concise explicit
  examples of a Closed Markdown Card, an Open Markdown Card, an Open Space Card
  and an Alias. The Space Card targets an ordinary example Space containing
  three Cards and a small Graph. The content has no protection after creation.
- Existing repositories are never silently reseeded. A confirmed or forced CLI
  hard reset destroys repository state and regenerates the Meta Space and
  Default Content. There is no merge-style seed command, V1 browser reset
  control or pre-V1 state compatibility path.
- Support is intentionally narrow: the documented Node and pnpm toolchain,
  PostgreSQL through Docker, macOS or Linux, and verified Chromium behavior.
- Feedback is collected manually with no telemetry. Only feedback that blocks
  or materially undermines the canonical journey may change V1 scope.
- Known non-blocking defects may ship. No known defect may threaten authoring,
  persistence, reload, import/export or presenting.

## Decisions so far

<!-- Resolved decision tickets are indexed here; their resolution comments own
the detail. -->

- [09 — Reconcile the confirmed V1 release contract](issues/09-reconcile-the-confirmed-v1-release-contract.md)
  assigns Default Content/reset to ticket 16 and keeps End-to-end distinct from
  the `v1.0.0` gate.
- [10 — Audit the canonical journey and its issue ownership](issues/10-audit-the-canonical-journey-and-ownership.md)
  records the built/partial/unbuilt matrix, overlapping ownership and the six
  decisions ticket 11 needs before it can define the checkpoint.
- [11 — Define the End-to-end checkpoint](issues/11-define-the-end-to-end-checkpoint.md)
  makes the complete clean-clone authoring and destructive-recovery rehearsal
  the untagged checkpoint, with a compact proof matrix and explicit
  post-checkpoint scope.
- [12 — Decide the V1 execution sequence and critical path](issues/12-decide-the-v1-critical-path.md)
  treats PR 134 as delivered foundation work, rewrites overlapping ownership,
  adds checkpoint tickets 17–19 and fixes the parallel lanes that rejoin at the
  clean-clone rehearsal.
- [13 — Decide how End-to-end feedback controls V1 scope](issues/13-decide-how-feedback-controls-v1-scope.md)
  admits feedback through an evidence-backed blocker/correction/post-V1 rule,
  assigns classification and scope authority, and requires explicit ownership,
  proof and critical-path updates before accepted work begins.
- [14 — Define the V1 release proof and go/no-go contract](issues/14-define-the-v1-release-proof-and-go-no-go-contract.md)
  requires a commit-specific proof matrix, fresh final rehearsal, classified
  defect register and binary human go/no-go before the approved commit receives
  annotated tag `v1.0.0`.
- [15 — Complete the V1 release implementation handoff](issues/15-complete-the-v1-release-handoff.md)
  joins the resolved contracts into one executable dependency graph, acceptance
  ownership matrix, documentation handoff and final tag checklist, with no known
  release decision left open.

## Not yet specified

- Feedback may expose canonical-journey blockers whose decision shape is not yet
  visible. Non-blocking requests remain beyond V1.
- Exact Default Content copy and final visual treatment remain deliberately
  low-fidelity until implementation needs them; use concise explicit examples
  rather than opening a separate content-design effort.

## Out of scope

- Hosted deployment, production operation and support for arbitrary end users.
- Telemetry or an in-product feedback system.
- Browser-facing reset, export or backup controls; the documented CLI is
  sufficient for V1.
- Migration or compatibility for pre-V1 databases and generated artifacts.
- Windows-native support unless the existing verified toolchain proves it
  without adding release work.
- Features already listed under **Deferred beyond V1** in the V1 Definition of
  Done, unless observed End-to-end use proves one blocks the canonical journey.
