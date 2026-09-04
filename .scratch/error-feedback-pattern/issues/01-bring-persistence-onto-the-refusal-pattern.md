# Bring persistence onto the refusal pattern

Status: ready-for-agent

Surfaced by: investigating whether persistence error handling should be
extracted as the application-wide error pattern. It should not — see `spec.md`.

## Context

ADR 0057 gives the application one rule: an expected failure crosses a seam as a
stable identity, and the application owns the sentence. `AuthoringRefusal` plus
`describeAuthoringRefusal` implement that rule for the 24 authoring codes.
Persistence does not follow it, and three separate paths put prose in front of
the author that the application never wrote.

**Transport prose reaches the screen.** `retryable-failure` and
`permanent-failure` each carry a stable `code` *and* a `message`
(`packages/persistence/src/backend.ts:53-63`). `PersistenceNotice` renders
`persistence.failure.message` (`packages/app/src/components/PersistenceControl.tsx:154`)
and `rejectionDescription` falls back to it (`:90`). Those messages come from
`packages/http/src/backend.ts:182`, `:206` and `:211`, which set them to
`problem.detail` — the server's sentence. ADR 0057 rejected `{ message: string }`
by name for exactly this. The seven codes those two failures actually carry —
`network`, `timeout`, `unavailable`, `rate-limited`, `invalid-commit`,
`forbidden`, `protocol` — have no copy table at all.

**A copy table lives in a component.** `AGGREGATE_REFUSAL_REASONS`
(`PersistenceControl.tsx:69`) and `CONFLICT_DESCRIPTIONS` (`:47`) do the job
`describeAuthoringRefusal` does, inline in the component that draws them, with
no placement concept and no shared home. `NETWORK_FAILURE_MESSAGE` is worse
placed still: it is a display sentence exported from `@project/http`
(`packages/app/stories/surfaces/cards-drawer.stories.tsx:4` imports it).

**Space Authoring returns English.** `acceptStoredSpace` answers
`string | null` (`packages/app/src/space-authoring.ts:1408`) and two of its
returns are hand-written sentences (`:1416`, `:1420`) — the second joins
`loadSpace` error messages into a multi-line string. That is prose crossing the
Authoring seam, which is the seam ADR 0057 exists to govern.

## What to build

The three arms above, on the pattern the rest of the application already
follows. **The aggregate arm is out of scope**: preserving each aggregate
refusal's structure and location through session state and `PersistenceControl`
is `.scratch/v1-release/issues/17-preserve-structured-aggregate-refusals.md`,
which is `ready-for-agent`. Leave `AGGREGATE_REFUSAL_REASONS` where it is and
let `17` move it, or coordinate — do not do it twice.

## Direction

**Extend the existing translator rather than adding a second one.**
`describeAuthoringRefusal` already takes a `PresentedAuthoringRefusal` — the
`AuthoringRefusal` union widened with `placement-failed`, which is not an
Authoring code — so the precedent for a presentation-only code is set and the
module is the right home. Whether the persistence codes join that union or take
a sibling function in the same module is an implementation call; what matters is
that one module holds every sentence the author reads.

**The codes stay as they are.** `retryable-failure`'s four and
`permanent-failure`'s three are already stable identities on the wire contract.
This change gives them copy, it does not rename or re-partition them.

**`acceptStoredSpace` answers an identity.** Its two prose returns describe two
conditions — the Space was deleted while a coordinated edit was saving, and the
stored snapshot failed intake. Both are refusals with a code; the second carries
the intake errors as typed context rather than as a joined string, and the
application decides how much of that to show. `null` continues to mean accepted.

**`problem.detail` stops reaching the screen.** It stays on the wire and stays
useful in a diagnostic, but the sentence the author reads comes from the code.
`NETWORK_FAILURE_MESSAGE` moves out of `@project/http`: the transport should not
own display copy.

## Blast radius

Two tests pin the prose this change replaces, and both are Ladle E2E, which
`verify` and `e2e` do not run:

- `packages/app/ladle-e2e/cards-drawer.spec.ts:84` asserts the notice contains
  `NETWORK_FAILURE_MESSAGE`.
- `packages/app/ladle-e2e/issue-14-space-sidebar.spec.ts:303` asserts
  `persistence-remote-refused` contains
  `'The remote space is invalid and was not accepted.'` — one of
  `acceptStoredSpace`'s two sentences.

Everything else reaches these surfaces by test id. `packages/app/stories/space/messaging.stories.tsx:17`
and `packages/app/stories/support/SpaceSidebarFixture.tsx:287` construct
failures with literal messages and will need the structured shape instead.

## Acceptance

- [ ] Every sentence a persistence failure shows the author is produced by the
      application from a stable code, not read from the wire.
- [ ] The seven `retryable-failure`/`permanent-failure` codes each have copy,
      and the mapping is exhaustive by construction — a new code fails to
      compile until it has a sentence.
- [ ] `NETWORK_FAILURE_MESSAGE` no longer exists in `@project/http`, and no
      display copy does.
- [ ] `acceptStoredSpace` answers a stable identity rather than prose, and the
      intake-failure case carries its errors as typed context.
- [ ] `CONFLICT_DESCRIPTIONS` lives beside the other copy rather than in the
      component that draws it. `AGGREGATE_REFUSAL_REASONS` is untouched unless
      `v1-release/17` has already landed.
- [ ] ADR 0057's `Build status:` line and `docs/agents/ui.md`'s claim agree with
      each other and with the tree.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass. All three apply: this
      changes application code, a persistence surface the browser reaches, and
      two components with stories.
