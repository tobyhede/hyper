# 08 — Settle the problem-details decode boundary

**What to build:** Decide whether the five assertions in `packages/persistence/src/http-protocol.ts` are defects to remove or an honest parse boundary to except, and act on the answer.

**Status:** needs-triage

**Why:** Under ADR 0062 these sites are in the suppressions baseline and are not blocking anything. What keeps this ticket alive is not the lint rule but a specific smell in the code, which the rule happened to point at.

The sites, measured at `f5506ce`:

- `code as HyperProblemCode` (line 99)
- `value as Record<string, unknown>` (line 133)
- `record['type'] as HyperProblemType` (lines 143, 149)
- `value as Record<string, unknown>` (line 185)

ADR 0057 makes this module the one place an RFC 9457 envelope is decoded into `CommitResult`. That is by definition the boundary where an untrusted representation becomes a domain value — the place where `unknown` is *supposed* to appear and where a checked narrowing is the honest operation, not a lie.

**The question:** is the current code actually doing the checking it asserts? Line 143 checks membership in `problemCodeByType` — but it asserts the type *before* the check that would justify it, which is `no-widen-then-assert` territory in spirit. A decoder that asserts its way to a domain value has the same hole as any other assertion; a decoder that validates and then returns the narrowed value has none.

- [ ] Read the module against ADR 0057 and `docs/agents/http.md` before choosing.
- [ ] Preferred outcome: a real parse — the module already owns the closed sets (`problemCodeByType`), so a lookup returning `HyperProblemCode | undefined` proves what the assertion currently claims, with no exception needed.
- [ ] If the parse is not an improvement, leave the sites as they are — they are already recorded and commented. An exception argued in a config file is worse than a documented assertion in the code, which is one of the reasons ADR 0062 rejected the full cleanup.
- [ ] Whichever way it goes, the decoder's contract tests must still assert problem types and decoding, per ADR 0057.
- [ ] `pnpm verify` and report the real output.
