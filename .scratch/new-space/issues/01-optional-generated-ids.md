# 01 — Ids optional in the file, generated on load

Status: open
Type: task

ADR 0019. Pure, lands green on its own, no app change.

**Deferred, and no longer blocking.** The immediate path gives the fixture
explicit ids instead (ticket 04), so nothing waits on this. It is the harder half
— a derivation rule, a collision strategy, and a definition of "stable" that
survives insertion — and it is hard to reverse once ids are generated and saved,
which is exactly why it should not gate a schema field.

`spaceFileSchema` makes `id` optional on cards, routes and layouts; `loadSpace`
fills in what is missing before it validates references and indexes — so
everything downstream of intake still sees a total `id`, which is what ADR 0010's
"consistent by construction" already promises.

- **Generation is deterministic**: the same file yields the same ids every time.
  That is the whole reason it can happen at load. An id minted per load cannot be
  referenced, bookmarked or written into a Layout, because it names something
  different next time — it would be an object identity, not an id.
- Derive from what the author *did* write. A card's title is the obvious source
  (slugified); the fallback when that collides or is absent has to be decided
  here, and it must not be "position in the array" alone, since inserting a card
  would then renumber its neighbours.
- Collisions are the real work. Two cards titled "Intro" cannot both be `intro`,
  and whatever disambiguates them must be stable under *appending* a third.
- `loadSpace` stays **pure** — no clock, no randomness. That is what keeps the
  property tests honest, and it is why ADR 0016's injected-generator machinery is
  not needed.

Watch for: a generated id colliding with an *authored* one elsewhere in the file.
The authored name must win — the author wrote it, and silently moving it would
break their own references.

## Acceptance

- Unit tests: a file with no ids loads and every entity has one; the same file
  loaded twice yields identical ids; an authored id is never moved.
- A property test: for any set of cards, ids are unique, and adding a card leaves
  the existing ids unchanged.
- `pnpm verify` green.
