# 06 — Deterministic skill evidence

**What to build:** Nothing here. Moved.

**Status:** wontfix

**Why:** the fixture set — small files each embodying one rejected construct, asserted against the real `tsc`/`eslint`/`oxlint`, plus the converse for constructs that must stay legal — is now part of `.scratch/typescript-7/issues/06-adopt-the-assertion-ratchet.md`.

It belongs there because of what it actually proves. It is a claim about the **rules**: that a new `any` or a new narrowing assertion fails, and that `as const`, `as const satisfies`, the `unknown` containment and a genuine parse boundary still pass. None of that is evidence about the skills. Ticket 06 over there already needed a test that the suppressions baseline cannot be quietly deleted and that a new assertion fails — the same fixture arrived at from the other direction, so keeping two was duplication.

What that leaves this effort with is no machine-checked output of its own, which is worth stating rather than hiding. The skills' evidence is the recorded trigger pass in issue 04 and, if it ever happens, issue 07. That asymmetry is real and was accepted knowingly: the rules are checkable and the guidance is not, which is the same reason ADR 0062 exists as a rule and the skills exist as prose.
