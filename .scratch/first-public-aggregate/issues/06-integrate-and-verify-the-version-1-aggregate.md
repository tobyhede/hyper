# Integrate and verify the version 1 aggregate

Status: ready-for-agent
Blocked by: 03, 05, 07

## What to build

Nothing new. This is where the shared branch is promised green, and where the
proofs the handoff names for package 2 are actually run rather than assumed.

Tickets `02`–`05` each leave part of the tree red on purpose: the version 1
shape has no compatibility form, so no ordering of them keeps every suite
passing along the way. That was the deliberate trade against an expand–contract
sequence, which would have bought per-commit green at the price of a
temporarily conditional closure rule — an Edge endpoint's obligation depending
on where its Graph sat. That is the exact shape of defect ADR 0045 exists to
close, so it was not worth building even briefly. The debt is paid here.

Run the whole bar, fix the fallout, and delete rather than adapt tests that
assert a shape the first-public aggregate does not have.

Three proofs are load-bearing and must exist as tests, not as observations:

1. No View output can violate closure or reuse a source Graph identity.
2. A Space carrying one Graph id in two Layouts is a named load error
   identifying both owners — not a silently shortened index.
3. The fixture's Flow view draws all four Graphs across its two Layouts.

Then reconcile the standing guidance to what is now true. ADR 0040 and ADR 0045
stop being "accepted, not built" in AGENTS.md; `CONTEXT.md`'s Layout, View,
Algorithmic View and Id entries stop describing a Space-level Graph collection;
the handoff's package 2 is marked done and its remaining packages left alone.

**The fallback band stays.** Package 5 of the handoff deletes it and builds its
replacement together. Do not take it out here because it looks vestigial.

## Green bar

`pnpm verify`, the full Playwright suite, and PostgreSQL integration — all
green, all reported with real output. `pnpm postgres:up` before the integration
run and `pnpm postgres:down` after.

**PostgreSQL is a first verification here, not a re-run.** Ticket 04 migrated
`test/integration/postgres-space-repository.test.ts` and `hyper-cli.test.ts` and
left them typecheck-clean, but could not execute them — no Docker daemon was
available in that worktree. Nothing has yet exercised the version 1 shape
against a live database: not the id minting under a Layout, not the JSONB
round-trip, not the revision check. Treat a failure here as a real defect in
ticket 04's work rather than as environment noise, and do not close this ticket
on the strength of the tests merely compiling.

## Acceptance criteria

- [ ] `pnpm verify` green.
- [ ] `pnpm e2e` green, including the fixture and new-space projects.
- [ ] `pnpm test:integration:postgres` green against a live database, and
      PostgreSQL stopped afterward.
- [ ] `pnpm e2e:postgres` green — a real edit survives a fresh Vite host on the
      version 1 shape.
- [ ] The three proofs above exist as tests.
- [ ] A version 2 document is rejected by name anywhere it can enter: intake,
      import, HTTP commit and the CLI.
- [ ] AGENTS.md, `CONTEXT.md` and the implementation handoff describe the built
      state; no entry still calls ADR 0040 or 0045 unbuilt.
- [ ] The fallback band and its two guards are still in place.
