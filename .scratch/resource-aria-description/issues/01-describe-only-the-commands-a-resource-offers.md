# 01: Describe only the commands a Resource offers

Status: needs-triage

**What to build:** A Resource's accessible description names only the keyboard commands the canvas offers it at that moment.

**Why:** `SpaceCanvas` passes React Flow one fixed `ARIA_LABEL_CONFIG`, so a focused Resource always tells a screen reader it can be deleted with Backspace or Delete and moved with the arrow keys. Availability withdraws those commands while presenting, during a chrome rename, and under the inert and read-only policies, so a screen-reader user is told about commands that then do nothing. Found by the `/code-review medium` of PR #349; it predates that PR, which removed only the pending-placement variant no node could carry.

**Acceptance criteria:**

- [ ] With the canvas surface holding the read-only or inert policy, a focused Resource's description names neither delete nor move.
- [ ] While presenting, the description names neither.
- [ ] Where the commands are offered, the description is unchanged.
- [ ] The description is derived from the same availability the keyboard handlers read, not decided separately.
