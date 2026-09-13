# 10 — Extend the development fixture to linked Spaces

**What to build:** Give development, E2E and release verification one legible
multi-Space fixture rooted in the Meta Space.

**Blocked by:** `v1-release/08` — Round-trip the complete Space aggregate.

**Status:** resolved
Tags: release/v1

- [x] The fixture contains the Meta Space and several referenced ordinary
      Spaces, with at least one converging reference and depth of at least three.
- [x] Every ordinary fixture Space remains reachable from the Meta Space.
- [x] Fixture content is meaningful enough to verify opening, editing, Enter,
      switching and presentation rather than using placeholder Card names.
- [x] The fixture is a complete `hyper.json` aggregate consumed by
      `pnpm dev:fixture` and the Chromium E2E project through normal import and
      HTTP boundaries.
- [x] Cycle refusal remains an aggregate-intake test rather than an invalid
      fixture.

## Answer

`packages/app/fixture/` is a canonical aggregate: `hyper.json` names the
existing Diagram fixture as Meta, and three ordinary Spaces hang off it.

```
Diagram fixture
  → Presentation walkthrough → Authoring notes     (depth three)
  → Deep dive
Presentation walkthrough → Deep dive               (converging)
```

Linked Spaces is a third Diagram on Meta, so Collection 1 still opens first and
the e2e canvas stays the A–T overlay. `importFixture` reads the directory with
`readAggregate` and seeds it through `initializeAggregate`. Cycle refusal stays
in `packages/graph/test/space-aggregate.test.ts`.
