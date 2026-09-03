# 03: One resolution module, and no injected resolver

**What to build:** One module stands between a Layout id and the Layout it names, and it is named for Layouts.

It has three jobs: apply the Space's default-Layout fallback, fail loudly when an id names no Layout, and derive the Placement material — the Space's own Card objects the Layout places, and nothing else. It answers `@project/graph`'s existing resolved-Layout value unchanged, because this is that value plus derivations, not a second kind of Layout. Three names for an aggregate were tried and rejected in the design session; the conclusion was that the aggregate should not exist.

Collaborators stop receiving the resolver as a constructor argument and import it instead. It took no arguments and no test ever substituted it, so it was a hypothetical seam with one implementation; the rule that governs injection is about nondeterminism, and a pure resolver is not that.

The canvas draws identically, Navigation opens the same Graph, and Space Authoring completes the same Edits.

**Blocked by:** 01 (its signatures name a Layout id).

**Runs beside 02, not clear of it.** Both tickets edit the Sidebar story fixture and the story-Space test. Whichever lands second rebases on the first.

**This ticket does rename what it retypes.** Deleting the aggregate type changes the type of every parameter and local currently bound to it, in Navigation, the projection and the composition. Rename those bindings here, with the type change that forces them — leaving them spelled for a deleted type through one ticket is worse than a slightly wider diff. Ticket 04 owns every identifier whose *type* does not change.

**Status:** done

- [x] A Layout-named resolution module exports exactly four names: the throwing default-Layout accessor, the resolver, the Layout-Cards derivation, and one error type
- [x] The default-Layout accessor is named so it does not shadow the persisted field it reads, and so its name says it throws. Its callers include destination opening as well as composition and Space Authoring
- [x] The resolver answers `@project/graph`'s resolved-Layout value; no wrapper type is introduced
- [x] The Layout-Cards derivation answers the Space's own Card objects, for that Layout's members only, in the Space's Card order
- [x] The error type carries no reason field; both throw sites mean the same thing
- [x] The subject type, the subject checker and the second invariant reason are deleted — intake already rejects duplicate Card, Graph and Layout ids, and the subject was built from the Space's own objects by construction. Nothing outside the module calls the checker and no test asserts its arm, so no coverage moves with it
- [x] The copied Graph collection is deleted; its readers read the Layout's own Graphs. There are five, not three: Navigation, the projection, and three story fixtures
- [x] The positioned strategy is built at its one production consumer, from the Layout's Placement. The two story fixtures and the projection tests that read it off the aggregate build their own the same way
- [x] The identity-comparison helper in Edge Authoring is deleted in favour of a direct comparison
- [x] Navigation and Space Authoring import the resolver; the constructor parameter and the composition that threaded it are gone, and the identity generator stays injected exactly as before
- [x] **The story-support navigation module loses the resolver too.** It is a second injection site: it takes the resolver as a parameter, constructs one itself, and hands it back from its hook. Two further story fixtures construct one directly. All of them import the resolver instead
- [x] The two resolution test files merge into one, proving: the default accessor throws on a Space with no default; the resolver throws on an id naming nothing; the resolver with no id answers the default Layout; and the Cards derivation's membership and ordering
- [x] `SpaceApp.test.tsx` passes unedited
- [x] Navigation, Space Authoring, composition and projection tests change only where a call site changed — no test is added at those seams
- [x] `AGENTS.md`'s `app` package description names the module that exists. Three of its sentences describe the deleted shape: the composition's "one renderer resolver", the projection reading the copied Graph collection, and the aggregate "supplies only a subject and a strategy"
- [x] `docs/agents/rendering.md` is corrected where it says the projection reads the resolved renderer's subject
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` green, each reported with real output. The e2e suites are unedited in this ticket
