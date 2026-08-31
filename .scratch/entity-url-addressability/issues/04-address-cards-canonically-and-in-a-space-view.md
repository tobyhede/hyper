# 04 — Address Cards canonically and in a Space View

**What to build:** A person can copy and open either a canonical Card link or a link to that Card in the current Space View. Resolving the link reveals the Card without authoring Layout membership or Open/Closed state.

**Blocked by:** 03 — Address every Space View.

**Status:** resolved
Tags: release/v1

- [x] Canonical and contextual Card links survive direct navigation, reload, Back and Forward.
- [x] A Closed Card stays Closed; an included Card is focused and centered without producing an Edit.
- [x] A canonical Card omitted by the active Layout is revealed in the Cards collection without manufacturing a canvas position.
- [x] An explicitly contextual Layout-and-Card destination returns an actual 404 when that Layout omits the Card.
- [x] Copy-link commands distinguish canonical Card identity from Card-in-this-Space-View context, and `pnpm verify` plus `pnpm e2e` pass.

## Answer

`@project/http` now formats and resolves canonical and contextual Card destinations, including Card existence and explicit Layout membership. Its snapshot resolver gives browser history the same parsing, collision and compatibility rules without a second backend load. The application translates every resolved destination through one pure `destinationOpening` core shared by startup and `popstate`. Canonical Cards retain the Space's default renderer; when its Layout omits the Card, the Sidebar Cards collection reveals it without adding Layout membership or manufacturing a canvas position.

Opening a Card destination selects, focuses and centres the existing Closed Card without authoring Open/Closed state. The Sidebar offers distinct canonical and current-Space-View copy commands. Browser coverage proves direct navigation, reload, Back/Forward, contextual omission as a real 404, byte-identical stored state, canonical restoration after contextual navigation, and both copied URL shapes.

`pnpm verify` passed with 157 files and 1,788 tests passed (8 skipped). `pnpm e2e` passed all 126 tests, and `pnpm e2e:ladle` passed all 51 tests.
