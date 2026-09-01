# Complete the V1 release implementation handoff

Status: resolved
Tags: wayfinder:task, release/v1
Parent: [Chart the V1 source release](../map.md)
Blocked by: [Define the V1 release proof and go/no-go contract](14-define-the-v1-release-proof-and-go-no-go-contract.md)
Assignee: agent

## Question

Assemble the resolved decisions into one decision-complete implementation
handoff: the End-to-end boundary, dependency graph and critical path, parallel
work, feedback scope-control rule, complete V1 acceptance matrix, proof owners,
documentation obligations and tag checklist. Link existing implementation
tickets rather than duplicating their build instructions. Does any unresolved
decision remain between the current repository and the `v1.0.0` destination?

## Answer

This is the implementation handoff. The governing decisions are:

- [ticket 11](11-define-the-end-to-end-checkpoint.md) for the untagged
  End-to-end boundary and compact proof matrix;
- [ticket 12](12-decide-the-v1-critical-path.md) for ordering, parallel work,
  rewritten ownership and PR 134 follow-ups;
- [ticket 13](13-decide-how-feedback-controls-v1-scope.md) for feedback
  classification and scope change control; and
- [ticket 14](14-define-the-v1-release-proof-and-go-no-go-contract.md) for the
  final proof matrix, defect register, binary review and tag.

Implementation tickets own build detail. This handoff fixes how they join and
does not restate their internal designs.

### Entry condition

[V1/20](20-land-and-reconcile-layout-only-v1.md) is complete, so this entry
condition is met. It landed the Layout-only decision as ADR 0079, tracked
implementation tickets `layout-only-v1/01–04`, folded their aggregate criteria
into [V1/08](08-round-trip-multi-space-import-and-export.md), reconciled the
Definition of Done and the affected guidance/trackers, and retired the superseded
entries ticket 12 named. No downstream work may implement the retired Computed
View/Space View contract.

### Executable dependency graph

1. **Settle shared seams.** Build
   [architecture 12](../../architecture-review/issues/12-make-meta-lifecycle-one-deep-module.md)
   and
   [architecture 14](../../architecture-review/issues/14-deepen-open-spaces-composition.md).
   Run [architecture 13](../../architecture-review/issues/13-concentrate-aggregate-commit-semantics.md)
   as the mandatory diagnostic: refactor only if its differential test exposes
   drift. In parallel, complete
   [Alias Opening](../../alias-cards/issues/06-open-alias-shows-target-content-read-only.md),
   [V1/02](02-complete-the-cards-view.md), [V1/17](17-preserve-structured-aggregate-refusals.md)
   and [V1/18](18-restore-aggregate-http-wire-policy-proof.md).
2. **Complete aggregate-facing capabilities.** Once their individual seam
   blockers clear, run [V1/01](01-establish-the-meta-space-lifecycle.md),
   [V1/08](08-round-trip-multi-space-import-and-export.md) and
   [Space Card reference/lifetime authoring](../../entity-url-addressability/issues/07-author-a-space-card-reference.md)
   in parallel.
3. **Join Spaces into the application.** Build
   [in-place Space Card Opening](../../space-cards/issues/01-render-a-space-card-as-a-sub-flow.md)
   and the [tracked multi-Space fixture](../../space-cards/issues/10-extend-the-dev-fixture-to-linked-spaces.md),
   then build
   [Enter and independent Opening](../../entity-url-addressability/issues/08-enter-and-independently-open-a-space-card.md)
   through architecture 14's Open Spaces owner.
4. **Compose the checkpoint product.** Complete the unified Card-kind surface in
   [V1/03](03-complete-card-lifecycle-controls.md) and canonical Default Content
   and reset in [V1/16](16-seed-and-restore-the-meta-space-default-content.md).
5. **Close End-to-end.** Resolve required desktop evidence/accessibility gaps,
   resolve architecture 13 with either agreement evidence or its required drift
   refactor, then run [V1/19](19-prove-the-clean-clone-end-to-end-rehearsal.md).
   Its successful recorded clean-clone journey completes the untagged
   checkpoint.
6. **Classify observed feedback.** Apply ticket 13. Accepted blocker or
   correction work returns to its real owner, updates the Definition of Done and
   critical path where required, and reruns affected proof. Non-blocking work is
   recorded beyond V1.
7. **Finish the V1 product.** Complete [Layout management](../../layout-only-v1/issues/01-add-empty-layouts.md),
   [Graph management](05-add-graph-management.md),
   [replacement-discard acknowledgement](../../interaction-draft-invalidation/issues/04-acknowledge-markdown-prose-discarded-by-replacement.md)
   and [V1 product design](06-finalise-v1-product-design.md), including
   responsive surfaces and Ladle/application parity.
8. **Prove and tag.** Execute [V1/07](07-prove-the-v1-release.md) under ticket
   14's matrix, rehearsal, defect and go/no-go contract. V1/07 owns final
   observed narrow-screen usability after V1/06; V1/19 remains the earlier
   desktop checkpoint evidence.

The critical spine remains Layout-only → shared seams → Meta/aggregate/Space
Card lifetime → Opening/Open Spaces/fixture → Default Content and unified
controls → End-to-end rehearsal → classified corrections → full Layout/Graph
management and product finish → final proof and tag.

### Acceptance and proof ownership

The reconciled [Definition of Done](../definition-of-done.md) remains the only
acceptance baseline. V1/07 creates exactly one matrix row per checkbox and may
attach several typed evidence entries to a row.

| Definition-of-Done claims | Implementation owner | Proof owner |
| --- | --- | --- |
| Meta, persistence, import/export and reset | [V1/01](01-establish-the-meta-space-lifecycle.md), [V1/08](08-round-trip-multi-space-import-and-export.md), [V1/16](16-seed-and-restore-the-meta-space-default-content.md), [architecture 12](../../architecture-review/issues/12-make-meta-lifecycle-one-deep-module.md), [V1/17](17-preserve-structured-aggregate-refusals.md) and [V1/18](18-restore-aggregate-http-wire-policy-proof.md) | V1/07; V1/19 supplies checkpoint observation |
| Unified Card-kind selection, rename/delete command surface and destructive confirmation; feature-specific creation semantics remain with their kind owners | [V1/03](03-complete-card-lifecycle-controls.md) | V1/07; V1/19 covers the canonical path |
| Cards drawer and selected-Layout membership | [V1/02](02-complete-the-cards-view.md) | V1/07; V1/19 covers the canonical path |
| Move, Open, Close, Resize and Markdown source editing | [`canvas-card-authoring`](../../../packages/app/src/canvas-card-authoring.ts) and [`space-authoring`](../../../packages/app/src/space-authoring.ts); proof-discovered UI correction is assigned through V1/06 | V1/07; V1/19 covers successful use |
| Alias creation, read-only Opening and own-state editing | [Alias Opening](../../alias-cards/issues/06-open-alias-shows-target-content-read-only.md) and [V1/03](03-complete-card-lifecycle-controls.md) | V1/07; V1/19 covers successful use |
| Space Cards and multi-Space lifetime/navigation | [entity URL 07](../../entity-url-addressability/issues/07-author-a-space-card-reference.md), [entity URL 08](../../entity-url-addressability/issues/08-enter-and-independently-open-a-space-card.md), [Space Cards 01](../../space-cards/issues/01-render-a-space-card-as-a-sub-flow.md), [Space Cards 10](../../space-cards/issues/10-extend-the-dev-fixture-to-linked-spaces.md) and [architecture 14](../../architecture-review/issues/14-deepen-open-spaces-composition.md) | V1/07; V1/19 covers Enter, return and recovery |
| Layouts, Graphs and Edges | [`layout-only-v1/01`](../../layout-only-v1/issues/01-add-empty-layouts.md) and [`layout-only-v1/02`](../../layout-only-v1/issues/02-initialize-layoutless-space-on-first-working-load.md) for Layouts, [V1/05](05-add-graph-management.md) for Graphs and Edges; [V1/04](04-add-layout-management.md) is superseded | V1/07 |
| Presentation controls and traversal | [V1/06](06-finalise-v1-product-design.md) owns surface gaps; [`navigation`](../../../packages/app/src/navigation.ts) owns traversal state | V1/07; V1/19 covers the canonical recovered presentation |
| Durable Space, Layout, Card, Graph and presentation URLs | [entity URL 02](../../entity-url-addressability/issues/02-open-the-entry-space-at-its-canonical-url.md), [03](../../entity-url-addressability/issues/03-address-every-space-view.md), [04](../../entity-url-addressability/issues/04-address-cards-canonically-and-in-a-space-view.md), [05](../../entity-url-addressability/issues/05-address-graphs-canonically-and-in-a-space-view.md), [06](../../entity-url-addressability/issues/06-deep-link-ordinary-presentation-points.md) and [08](../../entity-url-addressability/issues/08-enter-and-independently-open-a-space-card.md); [`layout-only-v1/03`](../../layout-only-v1/issues/03-make-layout-the-only-v1-canvas-selection.md) retires the Space View URL shape before proof | V1/07; V1/19 covers canonical reload/recovery navigation |
| Product design and accessibility | [V1/06](06-finalise-v1-product-design.md) and [interaction-draft-invalidation/04](../../interaction-draft-invalidation/issues/04-acknowledge-markdown-prose-discarded-by-replacement.md) | V1/07 owns final desktop and narrow-screen observation; V1/19 supplies earlier desktop checkpoint evidence |
| Feedback, release decision and tag | [Ticket 13](13-decide-how-feedback-controls-v1-scope.md) and [ticket 14](14-define-the-v1-release-proof-and-go-no-go-contract.md), implemented by [V1/07](07-prove-the-v1-release.md) | Human directing V1 authorizes go/no-go |
| Included scope decisions and deferred work | The linked accepted decision in the Definition-of-Done row; a new capability must reopen that decision | V1/07 audits the direct decision link |

An implementation owner supplies focused unit, property, integration,
application, Chromium or Ladle evidence appropriate to its claim. V1/19 owns the
End-to-end observation, while V1/07 audits the final candidate and owns the
complete release package. Passing a broad suite without a claim-specific matrix
entry closes nothing.

### Documentation obligations

Before go/no-go, the candidate README and setup guidance must describe:

- the required Node/pnpm, Docker PostgreSQL and supported macOS/Linux setup;
- initialization into the permanent Meta Space and editable Default Content;
- the Markdown, Alias and Space Card workflow;
- Layout, Graph, presentation and durable URL behavior;
- save/reload and complete CLI export, confirmed/forced hard reset and
  subsequent `hyper <aggregate-path> --dangerous-truncate` recovery in that
  order, with no merge-style import;
- the supported Chromium scope and deliberate V1 exclusions; and
- the distinction between the untagged End-to-end checkpoint and `v1.0.0`.

Documentation evidence points to the final candidate commit. It cannot replace
executable or observed proof of product behavior.

### Final tag checklist

- [x] The Layout-only Definition-of-Done reconciliation is committed (V1/20, ADR 0079).
- [ ] Every V1/07 proof-matrix row is closed with typed, commit-valid evidence.
- [ ] `pnpm verify`, `pnpm e2e`, `pnpm e2e:ladle` and PostgreSQL integration are
      green on the final candidate SHA without a pass-on-retry being hidden.
- [ ] A fresh final clean-clone canonical journey is green after all accepted
      feedback work.
- [ ] Final observed narrow-screen usability is green after V1/06, in addition
      to the desktop clean-clone journey.
- [ ] Every known defect is classified; no unresolved blocker or incomplete
      accepted correction remains.
- [ ] README/setup obligations are proved on the candidate.
- [ ] The human directing V1 records go against the full candidate SHA, matrix,
      rehearsal, defect register and timestamp.
- [ ] Only after go, create annotated tag `v1.0.0` and verify its peeled commit
      equals the approved SHA.

### Remaining decisions

No known release-contract or product-scope decision remains between the
repository and `v1.0.0`. The Layout-only baseline is landed and reconciled, so
what remains of it is the implementation in `layout-only-v1/01–04`; architecture
13 may conditionally promote a refactor when its diagnostic runs, and End-to-end
feedback may create corrections through ticket 13. These are decided
contingencies and implementation work, not open design questions.

Exact Default Content prose and final visual treatment remain bounded
implementation choices under their existing acceptance criteria. A genuinely
new product capability or contradictory evidence must explicitly reopen the
relevant decision rather than expanding this handoff silently.
