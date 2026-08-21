# 06 — Adopt the assertion ratchet

**What to build:** Enable `@typescript-eslint/no-unsafe-type-assertion` as an error, record the existing findings in a committed ESLint suppressions baseline, and wire pruning into `verify` so the baseline can only shrink.

**Status:** ready-for-agent

**Why:** ADR 0062. The existing assertions were examined in a reviewed pass and stand on their `SAFETY:` comments; what has no gate today is the next one an agent writes, because a comment requirement is satisfied by prose. The baseline puts the gate on new code without contradicting the earlier review or paying for the hard tail.

Verified on the working tree at `f5506ce`, using this repository's ESLint 10.7:

- Generating a baseline covers all 79 findings across 39 file entries; exit 0.
- Re-running against it is clean.
- A new file containing a narrowing assertion fails.
- A ninth assertion in `render-adapter.ts`, which has eight suppressed, fails — and reports all nine, because a count-based baseline cannot tell which is new.

- [ ] Add `'@typescript-eslint/no-unsafe-type-assertion': 'error'` to the type-aware block in `eslint.config.js`.
- [ ] Generate the suppressions file with `--suppress-rule @typescript-eslint/no-unsafe-type-assertion` and commit it. Do not hand-edit it, then or ever.
- [ ] Add `--prune-suppressions` to the `lint` invocation `verify` runs, so a removed assertion drops out permanently and the ceiling lowers on its own. Without this the file goes stale and the ratchet stops being one.
- [ ] Decide where the suppressions file lives and whether `--suppressions-location` is needed; the default is repository root.
- [ ] Confirm the interaction with `--max-warnings=0` and that an unpruned stale entry fails rather than passing quietly.
- [ ] Leave `anti-slop/require-safety-comment-for-type-assertion` exactly as it is. The two rules do different jobs now — one demands a reason, the other caps the count — and weakening either to reduce overlap loses one of them.
- [ ] Add a test that the baseline exists, is non-empty and is not hand-maintained, so a future change cannot quietly delete it and leave the rule looking enforced.
- [ ] Build the fixture set that proves the ratchet bites, absorbed here from `.scratch/typing-skills/` issue 06 because it is a claim about the rule rather than about the skills. Small files, each embodying one construct, asserted against the real toolchain:
  - **Must fail** — an explicit `any`; `as any`; `as unknown as T`; a new narrowing assertion; a production non-null assertion; a `@ts-ignore`; a missing union case. Name which of `tsc`, `eslint` or `oxlint` rejects each. A fixture that passes is a gap in enforcement and a finding.
  - **Must pass** — `as const`; `as const satisfies Contract`; the broadening `as unknown` containment; `unknown` at a genuine parse boundary. A rule that rejects these is over-reaching, and this half is what catches it.
- [ ] Keep the fixtures out of the ordinary programs — they are meant to fail — using the mechanism the repository already uses for files excluded from lint and typecheck, and confirm they do not leak into `verify`'s normal passes.
- [ ] `pnpm verify` and report the real output.

**No longer blocked by issues 07–10.** Those were written when this ticket meant a 79-site cleanup. They are now opportunistic improvements, and this issue lands without them.
