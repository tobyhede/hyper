# 06 — Deep-link ordinary presentation points

**What to build:** A person can copy a link to the current Card in a presentation and open it directly in the named Space View and Graph. The link starts fresh Traversal history, while subsequent moves behave like ordinary browser navigation.

**Blocked by:** 04 — Address Cards canonically and in a Space View; 05 — Address Graphs canonically and in a Space View.

**Status:** resolved

- [x] Presentation has an explicit URL distinct from ordinary Card reading and resolves the named Space View, Graph and current Card.
- [x] Opening a copied presentation link starts at that Card without encoding or inventing earlier Traversal history.
- [x] Every presentation move pushes a browser entry; Back and Forward follow the linear sequence visited in that browser.
- [x] Malformed, unresolved or incompatible presentation destinations return the agreed 400 or actual 404 response.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

Presentation points now have the explicit contextual URL `/spaces/:space/views/:view/graphs/:graph/present/:card`. `@project/http` validates the named Space View, Graph and Card together, including Graph ownership and whether an Edge makes the Card part of that Graph; malformed shapes receive 400 and missing or incompatible combinations receive 404.

Navigation opens an addressed presentation atomically with fresh one-Card Traversal history. Starting, advancing and presenter retreat each push the resulting presentation point into browser history, while `popstate` restores the exact point without pushing again; exiting pushes the contextual Graph destination. The presenting chrome copies the current exact point and carries the required React Flow shortcut guard.

Browser coverage proves direct navigation, reload, a copied mid-Graph point with no invented past, presentation entry, advance, presenter retreat, linear Back/Forward, exit, exact clipboard output, real 400/404 responses and unchanged stored state.

`pnpm verify` passed with 158 files and 1,814 tests passed (8 skipped). `pnpm e2e` passed all 134 tests, and `pnpm e2e:ladle` passed all 51 tests.
