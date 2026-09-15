# Context deletion relocates every Space Thing

Status: accepted
Refines: 0076, 0079

Deleting a Diagram or Graph atomically updates every Space Thing that selects it,
rather than leaving a dangling selection to fall back when read. Diagram deletion
uses the target Space's resulting selected Diagram and its Active Graph and clears
the old Diagram's framing; Graph deletion uses the resulting surviving Graph and
retains framing. This keeps a Space Thing's selection durable and independently
authored while preserving aggregate validity at every stored revision.
