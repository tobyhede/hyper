# 22 — Explain oversized saves and allow recovery

**What to build:** When a save exceeds the existing 1 MiB request-body limit, explain the refusal, preserve unsaved Edits, and let the author reduce content and retry saving. Keep the current limit and full-snapshot transport; changing either requires later evidence and a separate decision.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Priority:** P3

**Decision confirmed:** Keep the current limit and provide actionable feedback. The limit applies to the submitted candidate request, including all participating Spaces in a coordinated save, rather than a fixed Resource count. A sufficiently large reduction already permits saving; a reduction that leaves the request over the limit still fails. This corrects the original premise that shrinking Edits could never save. Ticket 17's measurements demonstrate request-size growth, not a supported maximum Resource count.

**Verified baseline (origin/main 0ff11d50):** Specific oversized-save feedback already exists, and submitting a new Edit after an ordinary rejection already attempts saving the latest working state. Preserve these behaviors. Remaining work is to verify the complete recovery flow, address the agreed explicit retry affordance, and make feedback accurate for the whole submitted request.

- [ ] An oversized save produces a specific explanation that the save is too large and content must be reduced before retrying.
- [ ] The refusal preserves current unsaved Edits and does not present them as saved.
- [ ] The author can reduce content and retry through the application without reloading or making an unrelated Edit solely to trigger saving.
- [ ] A test across the HTTP boundary proves an oversized candidate is refused without a stored change, while a subsequent candidate below the limit succeeds.
- [ ] A reduction that remains oversized is still refused with actionable feedback and retained working state.
- [ ] Coordinated saves respect the total request-body limit; feedback does not claim a per-Space or Resource-count guarantee.
- [ ] Application coverage proves the refusal, retained edits and recovery flow. The request limit and transport remain unchanged.
