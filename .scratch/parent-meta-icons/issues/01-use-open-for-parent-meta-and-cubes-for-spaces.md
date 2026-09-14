# 01 — Use OPEN for Parent/Meta and cubes for Spaces

**What to build:** Make the chosen icon distinction consistent throughout the application: the supplied OPEN infinity-cube artwork identifies Parent/Meta, while regular Spaces and Space Things use cubes. Apply the pair across the Command Dock, creation controls, lists and canvas glyphs so the same meaning has the same mark wherever it appears.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Use the supplied OPEN artwork for Parent/Meta, preserving its original geometry and its legibility at the Dock's 16px size.
- [x] Use the regular cube for Spaces and Space Things across the Dock, creation controls, lists and canvas glyphs, including shared kind-icon consumers.
- [x] Own the artwork and icon mapping in the shared UI package; consuming surfaces use that shared mapping.
- [x] Preserve existing navigation, creation, selection and accessible control names while changing the glyphs.
- [x] Update icon tests, stable stories, catalogue evidence and application proofs to hold the approved distinction, including the Parent step beside the current Space.
- [x] Replace current guidance that describes the previous cube-for-parent and frame-for-Space treatment; retain accepted ADR bodies as historical records.
- [x] Pass repository verification, application E2E and Ladle E2E checks.

## Decision and scope

Approved in the Infinity Cube design review on 2026-09-14. The selected artwork is the supplied `infinity-cube-open-16.svg`, retained with the Review / Infinity Cube prototype at commit `4473e0f4` on branch `review/infinity-cube-mark`. Core and Closed-loop were not selected for Parent/Meta.

The prototype's Inline, Stacked and Vertical dock layouts remain design studies. This ticket selects the icon vocabulary only; no dock layout was selected. Capture the prototype as the design source when promoting the approved icon treatment.

## Answer

Implemented the approved icon pair in the shared UI facade. Parent/Meta renders the supplied OPEN artwork with its original 16px geometry; Spaces and Space Things share the existing corrected cube, including Space-based Alias glyphs. The current Meta Space is identified through the stored Meta UUID, so an ordinary Space opened directly keeps the cube.

The production Dock layout and commands are retained. Stable story claims, application and Ladle proofs, and current icon guidance now describe the selected pair. The prototype is captured at `4473e0f4` on `review/infinity-cube-mark`; the review story and its three SVG assets have now been removed from the live catalogue. The historical commit preserves the design studies and supplied artwork.

### Verification

- Parent artwork test failed against the old cube, then passed with the supplied OPEN paths.
- Space and Alias glyph tests failed against the old frame, then passed with the shared cube.
- The focused application proof failed while the current Meta Space still drew a cube, then passed after wiring the stored identity into the Dock. The proof also checks an ordinary Space opened directly.
- `pnpm verify`: passed; 206 test files and 2,559 tests with coverage.
- `pnpm e2e:ladle`: 86 passed.
- `pnpm e2e`: final full run, 194 passed. The first full run had 193 passes and a timeout in the existing second-connection test while waiting for Add F to Diagram. That test passed on a focused rerun and in the final full run, with no code change between those runs.

### Standards review

No findings. Shared ownership, application composition, accessible names and production-parity evidence satisfy the repository standards.

### Spec review

No remaining findings. Three stale comments describing the former icons were corrected and re-reviewed.
