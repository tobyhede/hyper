# 03 — Make Layout the only V1 canvas selection

Status: done
Tags: release/v1
Blocked by: none

**What to build:** Remove Computed Views and Space Views from the complete V1
product contract so every selectable and addressable canvas context is an
authored Layout, as ADR 0079 requires. Rename the persisted opening selection to
`defaultLayout` and roll the unreleased repository state forward without
compatibility intake.

- [x] Computed View identities, registries, renderer variants, conversion paths,
      selection rows and the Computed View conversion controls no longer exist in
      V1 code or generated state. Add Layout remains an ordinary authoring
      operation and keeps its control.
- [x] `defaultLayout` replaces `defaultRenderer` across schemas, snapshots, HTTP,
      repositories, authoring, navigation, fixtures, seeds, stories and tests,
      and at the two write sites those categories miss:
      `writeReleaseSpace` in `scripts/roadmap.ts`, which writes the field into
      the generated roadmap Space, and `src/export/export-space.ts:107` and
      `:109`, which write it from the CLI exporter. The retired spelling receives
      no transitional reader, while a retired identity in the current field fails
      ordinary schema and intake validation.
- [x] Layout URLs remain durable; URLs for removed Computed View identities use
      the ordinary not-found behavior, while malformed destinations retain the
      existing bad-request behavior.
- [x] A selected Layout draws only its own Cards and owned Graphs; no canvas
      flattens Graphs across Layouts.
- [x] Automatic Layout strategies remain non-addressable capabilities and the
      positioned strategy continues to draw authored Layouts; no strategy is
      privileged as the meaning of Layout.
- [x] Layout selection stays navigation rather than an Edit, and the next
      successful Edit in that Layout may record it as the new default.
- [x] Package surfaces, architecture guards and vocabulary tests prevent
      Computed View, Space View and the retired field from returning.
- [x] `CONTEXT.md`, `AGENTS.md`, the scoped `docs/agents/*.md` guidance, the root
      `README.md` and `packages/app/README.md` describe the Layout-only vocabulary
      the code now uses, and the ADR 0079 "decided, not built" banners are
      removed with the contract they were warning about.
- [x] The coordinated wide rewrite finishes green under the complete unit,
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

### Retired vocabulary that survived the sweep, then was closed in the same change

Two story parity claims had named the retired union term as a hyphenated
adjective — where the surface they describe now reads "Copy link to … in this
Layout" (`packages/app/src/components/SpaceSidebar.tsx:656`, `:664`), the
claims themselves still read the old compound. Both now read "distinct
canonical and current-Layout copy commands"
(`packages/app/stories/parity-claims.ts:213` and `:219`).

The guard had not caught them because `RETIRED_CANVAS_TERMS`
(`test/unit/current-domain-vocabulary.test.ts:37`) joined the two words with a
literal space, and a hyphenated compound was a different string. Prose in a
story claim cannot resurrect the entity, so this was the live-vocabulary tail
of this ticket rather than a contract defect — the regex now joins the pair
with `[ -]` instead, closing the gap the last box's claim did not cover.
