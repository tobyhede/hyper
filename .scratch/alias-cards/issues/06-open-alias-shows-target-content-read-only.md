# Open an Alias on its Target content read-only

Status: done
Tags: release/v1
Type: feature

## Decision

Implement ADR 0070. An Alias chooses its immutable Target at creation, Opens through the same Layout-owned operation as every Card, and renders the Target kind's content read-only. Ordinary Card, Layout and Graph authoring of the Alias remains available.

## What to build

- Route pointer, Enter and Space Opening through the same Card-opening operation for every Card kind.
- Apply the working-Space membership guard before offering Open, Close or Edit operations to any projected Card.
- Make an Open Alias use its own Title and the Target kind's existing content renderer.
- For a Markdown Target, render sanitised Markdown without source Edit, Save or Cancel controls.
- Keep Close and Resize as ordinary Layout edits, including remembered Open Size and derived neighbour displacement.
- Keep inline Title editing as the authoring interaction shared by every Card kind.
- Remove the existing-Alias metadata pane, Target picker, retarget completion and retarget-specific refusal presentation.
- Keep Target selection for Alias creation.
- Enforce Target immutability in Space Authoring so a caller cannot retarget an existing Alias through `edited-card`.
- Reword dependent deletion guidance so it no longer offers Retarget as recovery.
- Reuse the Markdown content renderer; do not introduce an Alias-specific copy.
- Leave Jump to Target and Edit Target out of scope under issue 05.

## Acceptance criteria

- [x] Opening, Closing and Resizing an Alias persist the containing Layout exactly as for other Cards.
- [x] Click, Enter and Space all Open an Alias, and a projected Alias absent from the working Space exposes no Card-authoring operation.
- [x] An Alias targeting Markdown renders the Target Markdown read-only under the Alias Title.
- [x] No Open Alias can edit Markdown source or Target.
- [x] An Alias Title remains editable through the shared Card Title interaction.
- [x] Space Authoring refuses changing the Target of an existing Alias while continuing to accept Title edits.
- [x] Creating an Alias still chooses its Target once and leaves the new Card ready for ordinary Title editing.
- [x] Existing retarget UI, state, refusal placement, wording and tests are removed atomically.
- [x] Unit and property tests cover target immutability and content resolution through the production module interfaces.
- [x] Application E2E covers keyboard Opening, reload persistence, Resize, Markdown read-only behavior and absence of retargeting.
- [x] Stable stories and Ladle E2E cover the read-only Markdown presentation.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

Space Card Target integration is deferred under issue 07; V1 Aliases target
Markdown Cards only.

## Answer

Aliases now Open and Close through the ordinary Layout-owned Card operation. The production projection resolves an Open Alias's immutable Target and passes its Markdown body to the shared sanitised renderer, while the Alias keeps its own Title, Resize control and Layout-owned Open Size. The Alias front exposes no content or Target editing capability; ordinary inline Title editing remains shared across Card kinds.

Space Authoring refuses an existing Alias Target change with `alias-target-immutable`. The superseded existing-Alias metadata editor, retarget state, refusal presentation, styles, stories and tests were removed together; Alias creation keeps the one-time Target picker and continues directly into inline Title editing. Stable story/application parity evidence covers read-only Target Markdown, keyboard and pointer Opening, reload persistence and Resize.

Verification: `pnpm verify` (1,949 passed, 2 skipped), `pnpm e2e` (149 passed), and `pnpm e2e:ladle` (65 passed).
