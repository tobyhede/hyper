# 06 — A Title that does not fit its Edge

Status: ready-for-agent (build as part of `05`)

**Decided:** At rest a Title is fitted to its Edge. Below a threshold — a fitted box that cannot hold about three characters and the ellipsis — nothing draws at rest. While the Edge is revealed (hovered, selected, or its Title being edited) the box grows to the whole Title up to the 224px ceiling, centred on the midpoint and raised over the Resources. The threshold is measured in canvas units: there is no zoom rule, and Titles scale with the Map as Resource Titles do.

**Why:** Fitting the Title to the Edge held it to a 40px floor on a 72px gap, which drew "If th…" — unreadable in every prototype variant. Any readable Title on a gap that short covers something; revealing is already how an Edge asks for attention, so that is when it may.
