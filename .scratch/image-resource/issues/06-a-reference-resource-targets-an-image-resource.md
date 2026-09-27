# 06 — A Reference Resource targets an Image Resource

**What to build:** Create Reference on an Image Resource creates a Reference Resource whose Open front draws the Target's image read-only, through the same content front as the Image Resource minus Replace (ADR 0070, ADR 0106). `resolveContentResource` resolves an image Target in one hop like the others. The Reference Resource's own first Open reads the Target's recorded natural size by the same rule, synchronously.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Create Reference is available on an Image Resource and names the new Reference Resource after it.
- [ ] The Open Reference Resource draws the Target's image and offers Close and Title editing, no Replace.
- [ ] Replacing the Target's image changes what the Reference Resource draws.
- [ ] `CONTEXT.md`'s Reference Resource entry lists Image Resource Targets (already written) and matches what is built.
