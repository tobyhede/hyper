# 24 — Explain blocked saves and offer explicit Retry

**What to build:** When a coordinated save cannot replay, show the current reason, identify any Space whose conflict blocks it, and provide a way to reach that Space. Preserve unsaved Edits and offer explicit Retry after the blocker is resolved. Resolving the blocker does not automatically replay the save.

**Blocked by:** None — can start immediately. Recovery correctness prerequisites 14 and 23 are merged.

**Status:** ready-for-agent

**Priority:** P2

**Decision confirmed:** Use explicit Retry. A refused replay must be visible and recoverable without requiring another Edit. Automatic replay after another coordination resolves is outside this ticket.

**Reproduction:** A coordinated Space Resource creation leaves Meta and TARGET rejected under recovery C0. A later creation leaves TARGET and CHILD conflicted under C1. Editing Meta attempts C0's replay, which refuses because TARGET needs C1's recovery. Previously, Meta retained its original rejection without explaining that TARGET now blocks saving; resolving C1 alone did not save Meta's Edits.

- [ ] Drive that sequence and assert that Meta's persistence feedback identifies TARGET as the Space requiring recovery, instead of retaining only the original rejection.
- [ ] The application provides a way to reach the blocking Space and resolve its conflict while preserving all unsaved Edits.
- [ ] Resolving the blocking coordination does not automatically replay the requesting save; an explicit Retry saves the latest working Edits without requiring another Edit.
- [ ] A failed replay read or another refused Retry updates the displayed reason and leaves Retry available with unsaved Edits intact.
- [ ] Retry continues to respect participant ownership and duplicate-attempt protection established by the merged recovery fixes; it cannot overwrite a newer recovery.
- [ ] Persistence tests cover refusal, blocker resolution and deliberate retry, and application tests prove actionable feedback and the Retry flow.
