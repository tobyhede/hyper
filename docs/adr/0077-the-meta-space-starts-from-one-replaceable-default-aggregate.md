# The Meta Space starts from one replaceable default aggregate

Status: accepted
Refines: 0054, 0056, 0069, 0074

On first repository initialization, Hyper creates the permanent Meta Space from
one deterministic aggregate containing concise examples of the V1 Card kinds.
The same generator supplies an explicit CLI hard reset. Reset atomically
replaces the complete repository after confirmation, or without interaction
when forced for automation. Initialization and reset therefore cannot drift.

The generated Cards, Layouts and Graphs are ordinary authored state. Hyper does
not mark them as protected, repair them or add them again when an initialized
repository loads. An author may edit or delete all of them. **Default Content**
is the release-fixture label for this generated aggregate, not a new domain
entity or Card kind, so it does not enter `CONTEXT.md`.

We reject a merge-style seed command because it would need conflict and identity
semantics for mixing examples into authored work. We reject silent reseeding
because an intentionally empty Meta Space is valid authored state. We also
reject a browser reset control and pre-V1 compatibility path: V1 is a local
source release whose repository and generated artifacts are derived, and the
destructive administrative operation belongs in the documented CLI.
