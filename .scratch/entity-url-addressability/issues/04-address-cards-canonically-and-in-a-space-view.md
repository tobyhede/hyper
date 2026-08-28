# 04 — Address Cards canonically and in a Space View

**What to build:** A person can copy and open either a canonical Card link or a link to that Card in the current Space View. Resolving the link reveals the Card without authoring Layout membership or Open/Closed state.

**Blocked by:** 03 — Address every Space View.

**Status:** ready-for-agent

- [ ] Canonical and contextual Card links survive direct navigation, reload, Back and Forward.
- [ ] A Closed Card stays Closed; an included Card is focused and centered without producing an Edit.
- [ ] A canonical Card omitted by the active Layout is revealed in the Cards collection without manufacturing a canvas position.
- [ ] An explicitly contextual Layout-and-Card destination returns an actual 404 when that Layout omits the Card.
- [ ] Copy-link commands distinguish canonical Card identity from Card-in-this-Space-View context, and `pnpm verify` plus `pnpm e2e` pass.
