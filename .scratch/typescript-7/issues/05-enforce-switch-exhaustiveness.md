# 05 — Enforce switch exhaustiveness

**What to build:** Enable `@typescript-eslint/switch-exhaustiveness-check` with no default-case escape, and clear the three findings.

**Status:** ready-for-agent

**Why:** Adding a variant to a discriminated union should identify every incomplete consumer; a `default:` branch that silently absorbs a new domain variant is the failure this prevents. `AuthoringRefusal` (ADR 0057) is exactly the union where this matters — its whole value is that a new refusal code changes the interface deliberately.

**This stands on its own, without an ADR.** It was originally drafted as a clause of ADR 0062. Grilling that ADR applied the three-part test to this too, and it fails: three sites is not hard to reverse, nobody familiar with the domain would be surprised, and there is no credible rejected alternative. It is a lint rule with three fixes, which is a ticket.

Measured findings at `f5506ce`, three in total:

- `packages/app/src/authoring-refusal.ts`
- `packages/http/src/backend.ts`
- `packages/app/test/space-authoring.property.test.ts`

- [ ] Add the rule to `eslint.config.js` with `allowDefaultCaseForExhaustiveSwitch: false`, `considerDefaultExhaustiveForUnions: false`, `requireDefaultForNonUnion: false`.
- [ ] Fix each site by enumerating the variants, not by re-adding a catch-all under a different name.
- [ ] If a site genuinely faces runtime skew — a value arriving from outside the program that the closed type does not actually close — make that exception narrow and say why the type is not closed at runtime. Neither of the two production sites looks like this; treat a claim that one is as a finding to challenge.
- [ ] `pnpm verify` and report the real output.

**Independent of the migration.** This rule does not depend on which compiler is authoritative and can land before or after issues 01–04.
