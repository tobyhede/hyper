# 06 — A Reference Resource targets an Image Resource

**What to build:** Create Reference on an Image Resource creates a Reference Resource whose Open front draws the Target's image read-only, through the same content front as the Image Resource minus Replace (ADR 0070, ADR 0106). `resolveContentResource` resolves an image Target in one hop like the others. The Reference Resource's own first Open reads the Target's recorded natural size by the same rule, synchronously.

**Blocked by:** 03, 05, `resource-content` 06

**Status:** ready-for-agent

- [ ] Create Reference is available on an Image Resource and names the new Reference Resource after it.
- [ ] The Open Reference Resource draws the Target's image and offers Close and Title editing, no Replace.
- [ ] Replacing the Target's image changes what the Reference Resource draws.
- [ ] `CONTEXT.md`'s Reference Resource entry lists Image Resource Targets (already written) and matches what is built.

## Comments

**2026-09-29, rework on `resource-content`.** A first implementation (PR #320, commit `209df220`) was built on an earlier `image-resource-05`, which has since been redesigned: ADR 0107 is gone (its substance is in ADR 0106), `imageUrl` is part of an Image Resource node's kind and may not be carried by a Reference Resource's node, and Replace image is an in-place upload target on the rail. Fixing that exposed that a Resource's content is inferred from which node fields are present, falling back to an empty Markdown document — which is what made the first implementation's closing fade draw nothing. `.scratch/resource-content/` replaces that inference with one resolved content value and a display state. Once its ticket 06 lands, this ticket reduces to the first-Open size rule for a Reference Resource to an Image Resource plus its tests and proofs: a Reference Resource to an image is image content with `via: 'reference'`, drawn through the same arm with Replace withheld. The graph half of `209df220` (`resolveContentResource` resolving an image Target, and `openSizeDocument`) is carried forward on this branch.
