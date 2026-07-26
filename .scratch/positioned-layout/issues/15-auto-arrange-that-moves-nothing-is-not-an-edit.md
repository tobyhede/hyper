# An auto-arrange that moves nothing is not an edit

Status: open
Type: task

The editor store's `arrange` ticks `revision` unconditionally. `changeNodes` explicitly refuses to for a settled drag that moved nothing, on stated grounds: *"a click, or a drag returned to where it began — is not an edit and must not trigger a save."*

So pressing Auto-arrange on a freshly opened fixture lights the Save button having moved nothing, because ELK is deterministic over the same graph. Saving then writes a Layout and repoints `defaultView`.

ADR 0025 permits this — it makes Auto-arrange an explicit act, and the author did press the button — so this is not conformance work and should not be sold as such. It is an inconsistency between two paths in one store, where one of them documents a principle the other ignores.

Decide whether they should agree. If the answer is that they should not, write the reason into `arrange` so the asymmetry stops reading as an oversight to the next person who finds it.
