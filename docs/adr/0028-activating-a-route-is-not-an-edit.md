# Activating a route is not an edit; a real save writes `activeRoute` explicitly

Status: accepted
Refines: 0025, 0026
Refined by: 0040, 0041
Related: 0021

ADR 0026 gives a Layout an optional `activeRoute` and rules that absent one, the first visible route is active. **That fallback is a read, never a write.** It is resolved on load so a hand-authored space works with nothing typed, and the app writes the field explicitly every time it saves — so a file the app has written names its active route outright rather than depending on the order its routes happen to sit in.

**Activating a route is not an edit.** It converts no algorithmic layout, it does not dirty the space, and on its own it never reaches the file. What it changes is carried in by the next **real** save — a drag, an auto-arrange, a drawn edge, a created card — written alongside whatever that save was for.

**A route minted by editing is set active explicitly.** ADR 0021's first edge in a route-less space mints the route it lands in, and ADR 0025 makes that same gesture convert the arrangement into a positioned Layout. The Layout that comes into existence therefore names the route that came into existence with it, in the same write. Nothing leans on the fallback to agree with what just happened.

## Why activation is not an edit

`activeRoute` lives on the Layout, so a space with no Layout has nowhere to record one. Making activation an edit means it must convert: switching routes to *look* at one would materialise authored positions for every card in the space, under an author who touched nothing. ADR 0025 put pan, zoom and fit on the far side of that line because they move the camera and not the space, and reading a different route belongs there with them — it changes no card, no route, and no edge.

So the write-side rule is attached to saving rather than to activating. The state exists at runtime either way; the only question is what puts it in the file, and the answer is the same thing that puts anything else there.

## What this does not change

ADR 0026's resolution order stands untouched: a Layout's `activeRoute` if it names one, else the first visible route. Nothing here removes the fallback or makes the field required — a space an author wrote by hand, with routes and no `activeRoute`, opens exactly as 0026 says it does. This decision is about what the *application* writes, not about what a space file must contain.

## The cost we accept

Activating a route and then dragging a card writes both, and the author asked for one of them. The drag is what they meant to save; the activation rides along unannounced. Acceptable because 0026 already guarantees activation is deliberate — a dedicated control, never a side effect of drawing, clicking, opening or panning — so the value being recorded is one the author chose on purpose. There is no way to try a route on temporarily and then edit without it sticking.

The other half of the cost is the more visible one: until some edit happens, activation is not durable at all. Switch route, reload, and the file's answer is back. That follows from "not an edit" and is correct, but it is the half most likely to be reported as a bug, so it is written down here as intended.

A future review will find that activating a route leaves the space clean and suggest it should mark it dirty, on the grounds that it changes what the file will say. That suggestion is this ADR. It changes what the file will say only when something else has already made the file worth writing — and the alternative is a reading gesture that fixes the position of every card in the space.
