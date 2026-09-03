# 03 — Make Layout the only V1 canvas selection

Status: ready-for-agent
Tags: release/v1
Blocked by: 02

**What to build:** Remove Computed Views and Space Views from the complete V1
product contract so every selectable and addressable canvas context is an
authored Layout, as ADR 0079 requires. Rename the persisted opening selection to
`defaultLayout` and roll the unreleased repository state forward without
compatibility intake.

- [ ] Computed View identities, registries, renderer variants, conversion paths,
      selection rows and Computed View conversion controls no longer exist in V1
      code or generated state. Add Layout and its control remain: they author an
      empty Layout rather than converting one.
- [ ] `defaultLayout` replaces `defaultRenderer` across schemas, snapshots, HTTP,
      repositories, authoring, navigation, fixtures, seeds, stories and tests;
      the retired spelling receives no transitional reader, and ordinary schema
      rejection is what a document still carrying it meets.
- [ ] Layout URLs remain durable; URLs for removed Computed View identities use
      the ordinary not-found behavior, while malformed destinations retain the
      existing bad-request behavior.
- [ ] A selected Layout draws only its own Cards and owned Graphs; no canvas
      flattens Graphs across Layouts.
- [ ] Automatic Layout strategies remain non-addressable capabilities and the
      positioned strategy continues to draw authored Layouts; no strategy is
      privileged as the meaning of Layout.
- [ ] Layout selection stays navigation rather than an Edit, and the next
      successful Edit in that Layout may record it as the new default.
- [ ] Package surfaces, architecture guards and vocabulary tests prevent
      Computed View, Space View and the retired field from returning.
- [ ] `CONTEXT.md`, `AGENTS.md`, the scoped `docs/agents/*.md` guidance, the root
      `README.md` and `packages/app/README.md` describe the Layout-only vocabulary
      the code now uses, and the ADR 0079 "decided, not built" banners are
      removed with the contract they were warning about.
- [ ] The coordinated wide rewrite finishes green under the complete unit,
      property, UI catalogue, E2E and Ladle-E2E suites.

This ticket owns the domain, persistence, HTTP, URL and application removal of
Computed View and Space View, and the live-vocabulary edits that follow the code.
The historical ADR bodies under `docs/adr/` are provenance and stay as written.

## Comments

### Surface added after this ticket was written

ADR 0081 landed two new types in the retiring renderer vocabulary, so the
rewrite above has sites this ticket did not name when it was drafted:

- `NavigationAddress` (`packages/app/src/navigation.ts`) — its
  `selectedRenderer` field, and `navigationAddress`, the function deriving it.
- `AddressedPosition` (`packages/app/src/destination-coordination.ts`) — the
  same field, plus `samePosition` and `openingPosition` over it.

Both are `app`-layer and neither is persisted, so they cost this ticket a rename
rather than a schema or wire change. They are recorded here because the wide
rewrite is coordinated and a site discovered part-way through it is the
expensive kind. ADR 0081's own body is provenance and stays as written; what
changes is the code it describes.
