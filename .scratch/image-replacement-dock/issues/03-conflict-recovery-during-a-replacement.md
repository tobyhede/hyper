# 03: Conflict recovery during a replacement is split by whether it replaces the session

**What to build:** When a conflict stands during an in-flight replacement, the conflict dialog offers "Keep local and retry", which re-commits the working Space and replaces nothing, and draws Reload unavailable, because accepting the stored Space replaces the session under the replacement. Availability gains a `replaceSession` answer, false while a replacement runs; the dialog reads it rather than a blanket disabled flag, and Open of a blocking Space follows ticket 02's `navigate` answer.

**Blocked by:** 02

**Status:** ready-for-agent

Test seams (confirmed): the persistence control through its roles; app e2e with a conflict standing during a held replacement.

- [ ] Availability answers `replaceSession` false while a replacement runs, and true otherwise.
- [ ] During a held replacement, "Keep local and retry" is available and pressing it re-commits.
- [ ] During a held replacement, Reload is drawn unavailable and does nothing.
- [ ] Once the replacement answers, Reload is available again.
- [ ] The persistence control takes no blanket disabled flag.
