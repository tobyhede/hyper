# Open an Alias on its Target content read-only

Status: ready-for-agent
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

- [ ] Opening, Closing and Resizing an Alias persist the containing Layout exactly as for other Cards.
- [ ] Click, Enter and Space all Open an Alias, and a projected Alias absent from the working Space exposes no Card-authoring operation.
- [ ] An Alias targeting Markdown renders the Target Markdown read-only under the Alias Title.
- [ ] No Open Alias can edit Markdown source or Target.
- [ ] An Alias Title remains editable through the shared Card Title interaction.
- [ ] Space Authoring refuses changing the Target of an existing Alias while continuing to accept Title edits.
- [ ] Creating an Alias still chooses its Target once and leaves the new Card ready for ordinary Title editing.
- [ ] Existing retarget UI, state, refusal placement, wording and tests are removed atomically.
- [ ] Unit and property tests cover target immutability and content resolution through the production module interfaces.
- [ ] Application E2E covers keyboard Opening, reload persistence, Resize, Markdown read-only behavior and absence of retargeting.
- [ ] Stable stories and Ladle E2E cover the read-only Markdown presentation.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

Space Card Target integration is tracked separately in issue 07 because ADR 0068 remains proposed and unbuilt.

