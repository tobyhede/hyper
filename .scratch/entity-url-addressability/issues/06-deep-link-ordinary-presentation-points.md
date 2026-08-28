# 06 — Deep-link ordinary presentation points

**What to build:** A person can copy a link to the current Card in a presentation and open it directly in the named Space View and Graph. The link starts fresh Traversal history, while subsequent moves behave like ordinary browser navigation.

**Blocked by:** 04 — Address Cards canonically and in a Space View; 05 — Address Graphs canonically and in a Space View.

**Status:** ready-for-agent

- [ ] Presentation has an explicit URL distinct from ordinary Card reading and resolves the named Space View, Graph and current Card.
- [ ] Opening a copied presentation link starts at that Card without encoding or inventing earlier Traversal history.
- [ ] Every presentation move pushes a browser entry; Back and Forward follow the linear sequence visited in that browser.
- [ ] Malformed, unresolved or incompatible presentation destinations return the agreed 400 or actual 404 response.
- [ ] `pnpm verify` and `pnpm e2e` pass.
