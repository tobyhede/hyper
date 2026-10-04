# 01 — Shape on the Map entry

Status: ready-for-agent
Blocked by: None

**What to build:** a Map entry for a Resource carries a required `shape`, one of `rectangle | pill | ellipse | diamond | hexagon`, beside position, Open/Closed state and Open Size. Add Resource and Add to Map write `rectangle`; Remove from Map drops it with the entry. Every other Edit that rewrites an entry (Move, Open, Close, Resize, displacement, automatic arrangement) preserves it. A new Edit changes one Resource's Shape on one Map; choosing the Shape it already has is `unchanged`. Intake, export and import carry the field; every tracked fixture, seed and the roadmap generator write `rectangle`. There is no rule reading a missing `shape` as rectangle (ADR 0054, ADR 0056).

**Acceptance:** the schema refuses an entry without `shape` and an unknown value; unit tests cover each creation path writing `rectangle`, each placement Edit preserving it, the Shape Edit's `completed`/`unchanged`, and undo; the aggregate round trip preserves a non-default Shape on both databases through the shared repository contract.
