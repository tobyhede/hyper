# A real save writes `activeRoute` explicitly

Status: open
Blocked by: 04

ADR 0028: the resolution fallback is a read, never a write. `serializeLayout` takes the active route id and puts it on the Layout it builds, beside `positions` — so a file the app wrote names its active route outright instead of depending on the order its routes sit in.

Only on a **real** save. The save effect in `App.tsx` already fires on `revision`, which counts settled drags and arranges and never the creation sync, so this needs no new trigger: activating a route does not bump `revision` and therefore does not reach the file on its own.

That is the whole of "activating is not an edit" — there is nothing to add to make it true, only nothing to add that would make it false. Do not wire the active route into `revision`, and do not save on activation.

Write no `routes` filter. The app has no UI for authoring one; a Layout it writes shows every route, which is what absent means.
