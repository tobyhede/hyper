# Define the End-to-end checkpoint

Status: resolved
Tags: wayfinder:grilling, release/v1
Parent: [Chart the V1 source release](../map.md)
Blocked by: [Audit the canonical journey and its issue ownership](10-audit-the-canonical-journey-and-ownership.md)
Assignee: unassigned

## Question

Using the journey audit, which exact capabilities and evidence form the minimum
End-to-end checkpoint at which a technical author can begin meaningful observed
use? Decide the boundary without pulling final Layout management, Graph
management, responsive polish or full release proof forward unless the journey
cannot be used truthfully without them.

## Answer

### Boundary

End-to-end is complete when one technical author successfully performs the
complete canonical journey from a clean clone on the supported local stack and
the compact proof matrix below is green. That recorded rehearsal is the
checkpoint completion event. Broader observed use begins immediately afterward;
End-to-end remains untagged and is not the `v1.0.0` release.

The author must be able to:

1. install and launch Hyper using the documented Node/pnpm and Docker PostgreSQL
   path on supported macOS or Linux, then use verified desktop Chromium;
2. begin at the permanent Meta Space with deterministic, editable Default
   Content and no silent reseeding on later loads;
3. edit the supplied Markdown example and create a new Markdown Card;
4. create an Alias with an immutable Markdown Target, Open it on the Target
   content read-only, and continue to author the Alias's own Title and Layout
   state;
5. create a Space Card that atomically creates one ordinary Space, enter that
   Space, add three Cards to its supplied Layout, connect them in its supplied
   Graph, and return without losing work;
6. add and remove Cards through the Cards View, move/Open/Close/Resize Cards,
   and create/reconnect/delete Edges in the supplied Layout and Graph;
7. save through HTTP/PostgreSQL, reload, and recover the same working state;
8. present the newly authored Active Graph, including an ordinary advance, a
   fork choice and Back, then exit presenting;
9. export the complete Meta-rooted aggregate through the CLI;
10. perform a confirmed CLI hard reset and observe the canonical Meta Space and
    Default Content return;
11. recover the export explicitly with
    `hyper <aggregate-path> --dangerous-truncate`, never by merge; and
12. reopen the recovered aggregate in Chromium, verify the authored identities,
    content, selections, Layout state, Graphs and Space references survived, and
    present the recovered Graph again.

This is the minimum truthful journey. A checkpoint that stops after presentation
would not observe the release's sharpest data-integrity boundary and could not
validate the promised recovery path.

### Proof matrix

Every line below must link to the named executable or observed evidence before
the rehearsal begins. Ticket 07 later expands this compact proof matrix into the
complete V1 Definition-of-Done proof matrix.

| Claim | Required evidence at End-to-end |
| --- | --- |
| Supported installation and launch are real | One recorded human clean-clone rehearsal on macOS or Linux using the documented Node/pnpm and Docker PostgreSQL commands; automated toolchain, migration and startup checks are green. |
| Meta initialization and Default Content are canonical | Unit and PostgreSQL integration tests prove first initialization, deterministic identities, no-reseed reload, reset cancellation, forced/confirmed reset and atomic failure; Chromium proves the initialized Cards open and remain ordinarily editable. |
| Markdown, Alias and Space Card authoring joins into one journey | Application and Chromium tests cover kind selection, immutable Targets/references, read-only Alias Opening, new-Space atomicity, Enter/return and independently addressable target Spaces. |
| Layout and Graph authoring is sufficient | Application and Chromium tests cover Cards View Add/Remove, Move/Open/Close/Resize, Edge create/reconnect/delete, fork choice and persistence in the initialized Layout/Graph. Full management is not required. |
| Multi-Space behavior is repeatable | `space-cards/10` supplies one tracked Meta-rooted fixture through normal HTTP boundaries, including converging references and enough content to exercise Open, Enter, switching, deletion safety and round trip. |
| Ordinary persistence and reload are durable | PostgreSQL integration and Chromium prove authored Edits survive reload and a fresh host. |
| Failure and conflict recovery remain safe | Executable application/E2E evidence—not the normal human script—proves failure, Retry, conflict, Accept remote, Resolve, and safe switching/closing around every live Space persistence state. |
| Presentation is usable | Chromium proves start/exit, advance, fork choice, Back and the recovered Graph presentation. Cross-Space traversal remains deferred. |
| Aggregate recovery is exact | CLI and PostgreSQL integration prove export→reset→destructive import preserves the complete aggregate's authored identities, content, selections, Layout state, Graphs and references; Chromium reopens and presents it. |
| Required UI is truthful and operable | The complete desktop Chromium path has keyboard operation, visible focus, accessible names, non-colour status/action cues and understandable persistence failures. |

The multi-Space fixture is checkpoint work, not merely final release proof. It
keeps the automated evidence repeatable while the human rehearsal tests whether
authoring the journey is understandable.

### Prerequisites before checkpoint implementation proceeds in parallel

- Met by `v1-release/20`: ADR 0079 is accepted, `layout-only-v1/01–04` are
  tracked, and the Definition of Done and the affected Layout, Space Card and URL
  tickets are reconciled. The checkpoint exercises Add Layout and first-load
  initialization rather than the superseded conversion path.
- Resolve architecture issues 12, 13 and 14 before their dependent feature work
  begins. Each must either own the shared Meta lifecycle, aggregate-commit or
  Open Spaces seam and become an explicit blocker, or close as advice. Parallel
  tickets must not build competing seams.
- Ticket 19 owns the clean-clone setup and rehearsal work package, including
  defects found while following the supported setup.
- Make `space-cards/10` an explicit checkpoint dependency.

Ticket 12 owns the resulting dependency graph, sequencing, parallel work and
ticket rewrites; this ticket fixes only the checkpoint boundary.

### Deliberately after End-to-end

- full Layout create/rename/select/delete management beyond using the initialized
  Layout;
- full Graph create/rename/recolour/delete management beyond authoring the
  initialized Graph;
- narrow-screen completion and final responsive/visual polish;
- exhaustive Ladle and Definition-of-Done evidence, final README completion and
  the `v1.0.0` go/no-go package; and
- any feature already deferred beyond V1.

Deferral does not permit a dishonest checkpoint. A known defect may remain only
when it is cosmetic or low-friction. No known defect may lose authored state,
make recovery incorrect, block a required step, make a required action
inaccessible, or report success misleadingly.
