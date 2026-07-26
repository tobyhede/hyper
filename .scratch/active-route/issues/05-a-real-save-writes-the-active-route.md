# A real save writes `activeRoute` explicitly

Status: resolved
Blocked by: 04

ADR 0028: the resolution fallback is a read, never a write. `serializeLayout` takes the active route id and puts it on the Layout it builds, beside `positions` — so a file the app wrote names its active route outright instead of depending on the order its routes sit in.

Only on a **real** save. The save effect in `App.tsx` already fires on `revision`, which counts settled drags and arranges and never the creation sync, so this needs no new trigger: activating a route does not bump `revision` and therefore does not reach the file on its own.

That is the whole of "activating is not an edit" — there is nothing to add to make it true, only nothing to add that would make it false. Do not wire the active route into `revision`, and do not save on activation.

Write no `routes` filter. The app has no UI for authoring one; a Layout it writes shows every route, which is what absent means.

## Answer

`76b17e0`. `serializeLayout` gained the active route id and writes `activeRoute` when it is not null.

Two things the ticket got wrong, both found while writing it:

**"Write no `routes` filter" is not the same as not writing one.** `serializeLayout` replaces a Layout of the same id wholesale, so omitting the field *deletes* an author's filter on the next drag — a save silently discarding authored content. It now carries `routes` through unchanged. The rule that came out of it is sharper than "the store is the whole truth": the store is the whole truth of the *positions* and of the active route, and of nothing else.

**The effect needed no new trigger, but it did need care.** Reading the active route through a selector would have put it in the dependency array and made activation fire a save — precisely what ADR 0028 forbids. It is sampled with `useSpaceStore.getState()` instead, which keeps it out of the deps. That is the whole of "activating is not an edit", and it is one refactor away from being inverted, so it is written up in AGENTS.md.
