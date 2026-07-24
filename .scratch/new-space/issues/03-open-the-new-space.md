# 03 — Open a new space when there is nothing else to open

Status: done
Type: task
Blocked by: 02

The behaviour change, and the one carrying a real design question.

**Decided: the app opens a new empty space unless it is given a path to a space
file.** So `SPACE_BASE_ONLY` does not grow a third meaning — "which space opens"
turns on whether a path was supplied, and e2e supplies one pointing at the
fixture.

What is left to settle here is how the path reaches the app. It is a dev-server
input, because the server is the only thing that can read a file, and the client
must not send one (an endpoint taking a path from the browser is an
arbitrary-file-write primitive — the same reason the save endpoint fixes its
target in config). The plugin already resolves a fixed pair of paths; this
generalises that to one supplied path.

Whichever wins, the human's own saved arrangement must keep opening. Someone who
dragged cards yesterday must not be handed a blank new space today.

## Acceptance

- e2e: a fresh run shows one card, no route selector, Present disabled (ADR
  0015), and the card is draggable.
- e2e: the existing suite still drives the fixture and is otherwise unchanged —
  that is the guard that this did not quietly retarget every test.
- `pnpm verify` and `pnpm e2e` green.

## Answer

`SPACE_DIR`, a server-side env var naming the space directory to open. Supplied,
the plugin reads that directory and saves write back to it; absent, the app mints
one. So "which space opens" turns on whether a path was supplied and no existing
switch grows a second meaning, exactly as the ticket required.

**The human's saved arrangement keeps opening**, because `pnpm dev` sets
`SPACE_DIR=fixture`. `pnpm dev:new` (port 5174, so it can run beside the main
one) supplies nothing and shows the new space. That is not a contradiction of ADR
0018: the ADR says the app opens a new space when there is *nothing else to
open*, and this repo's dev script chooses to open something, exactly as an author
would.

**A minted space cannot be saved, and says so.** `PUT /__space` answers **501**
when there is no `SPACE_DIR` — there is nowhere to write. This is ADR 0020's own
stated cost, now enforced rather than implied: a space the app mints has a card
no file describes and cannot survive a reload until `card-files/03` grows the
writer. Without the guard, saving a minted space would have written it over the
fixture, since the target path used to be a constant.

**The no-directory branch emits browser source rather than importing `newSpace`
in Node.** The virtual module returns `import { newSpace } from '@project/graph'`
as text, which Vite resolves through the app's own alias. Importing it in the
plugin would have hit the documented config-load hazard — a bare `@project/*`
specifier is externalized and hands Node the workspace TypeScript source.

**Two Playwright servers, two projects.** `chromium` drives the fixture on 5173
and ignores `new-space.spec.ts`; `new-space` drives the no-`SPACE_DIR` server on
5174 and matches only it. The existing 19 tests are unchanged and still green —
the guard the ticket asked for. The drag helpers moved from `editing.spec.ts` to
`e2e/graph.ts` so both specs share one copy of the `settled` gate; no test in
that spec changed.

**`pnpm build` now ships a new space.** It sets no `SPACE_DIR`, so a build no
longer bakes in a fixture nobody authored — which also retires the caveat noted
when saves started writing in place, that a build would bundle whatever the last
save left behind.

### Two things the work turned up

**`maxZoom: 1` is now actually tested.** `new-space/02` landed it unexercised,
because the fixture's ten cards never approach the cap. A lone card does.
Verified by removing the cap and watching the new test report a zoom of exactly
2 — the ADR 0018 failure, reproduced.

**Card ordering was not total, and a property caught it.** `space.property`'s
order-indifference test began failing about one run in seven. `Array.sort` is
stable but not total: two cards sharing a *title* kept the order they arrived in,
which is the directory's — so the arrangement depended on scan order, the one
thing the sort exists to prevent. Ties now break on id, which is unique by
construction. The flake is replaced by a deterministic example test that fails
every time under the old behaviour, because a defect found one run in seven is a
defect that will be dismissed as flake.
