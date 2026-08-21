# 05 — Enforce switch exhaustiveness

**What to build:** Enable `@typescript-eslint/switch-exhaustiveness-check` with no default-case escape, and clear the three findings.

**Status:** resolved

**Why:** Adding a variant to a discriminated union should identify every incomplete consumer; a `default:` branch that silently absorbs a new domain variant is the failure this prevents. `AuthoringRefusal` (ADR 0057) is exactly the union where this matters — its whole value is that a new refusal code changes the interface deliberately.

**This stands on its own, without an ADR.** It was originally drafted as a clause of ADR 0062. Grilling that ADR applied the three-part test to this too, and it fails: three sites is not hard to reverse, nobody familiar with the domain would be surprised, and there is no credible rejected alternative. It is a lint rule with three fixes, which is a ticket.

Measured findings at `f5506ce`, three in total:

- `packages/app/src/authoring-refusal.ts`
- `packages/http/src/backend.ts`
- `packages/app/test/space-authoring.property.test.ts`

- [x] Add the rule to `eslint.config.js` with `allowDefaultCaseForExhaustiveSwitch: false`, `considerDefaultExhaustiveForUnions: false`, `requireDefaultForNonUnion: false`.
- [x] Fix each site by enumerating the variants, not by re-adding a catch-all under a different name.
- [x] If a site genuinely faces runtime skew — a value arriving from outside the program that the closed type does not actually close — make that exception narrow and say why the type is not closed at runtime. Neither of the two production sites looks like this; treat a claim that one is as a finding to challenge.
- [x] `pnpm verify` and report the real output.

**Independent of the migration.** This rule does not depend on which compiler is authoritative and can land before or after issues 01–04.

## Comments

Rule enabled in the type-aware block of `eslint.config.js` at exactly the three options the ticket specifies, and the three measured findings are the three that appeared. No fourth.

**`packages/app/src/authoring-refusal.ts`** and **`packages/http/src/backend.ts`** are the same finding twice: both closed their switch with the hand-rolled `default: return neverHelper(value)` idiom, and with the rule on, the compiler already proves the switch exhaustive, so the default is dead code the rule correctly objects to. Both `default:` clauses removed, along with the now-unreferenced `unreachable` and `assertNever` helpers — each had exactly one caller, the branch that was deleted. TypeScript accepts the functions without a trailing return, because an exhaustive switch over a discriminated union where every arm returns makes the end of the function unreachable.

**Neither is a runtime-skew site**, and the ticket was right to say so in advance. `backend.ts` was the one worth challenging, because its `code` derives from an HTTP response — but `problemCodeForType` throws on a type outside the catalogue, and `decodeProblemDetails` is the parse boundary that rejects an unknown `type` before anything downstream sees it. `HyperProblemCode` is closed at runtime, so the branch really was dead. `AuthoringRefusal` is minted inside `space-authoring.ts` and never crosses a boundary at all.

**`packages/app/test/space-authoring.property.test.ts`** was a genuine catch rather than a stylistic one: its `default:` was carrying real work — the whole `reconnected-edge` construction — under a label that would have silently absorbed any future operation and mis-resolved it as a reconnection. Fixed by naming the case, which is the point of the rule.

### The rule bites

Proved rather than assumed. Adding a `probe-a-new-variant` member to `AuthoringRefusal` and re-running `pnpm lint`:

```
packages/app/src/authoring-refusal.ts
  5:11  error  Switch is not exhaustive. Cases not matched: "probe-a-new-variant"
```

Restored afterwards. Before this change that variant would have compiled and linted clean, and refusals carrying it would have thrown at runtime instead of being caught in review.

### Verification

`pnpm verify` — exit 0; 140 test files, 1457 passed, 8 skipped. No coverage threshold moved, despite two throw-branches leaving the tree.
