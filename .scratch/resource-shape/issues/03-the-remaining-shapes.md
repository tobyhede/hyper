# 03 — Pill, ellipse and hexagon

Status: ready-for-agent
Blocked by: 02

**What to build:** the Closed front draws `pill`, `ellipse` and `hexagon` as 02 draws `diamond`: within the fixed Closed Size, Title Lines and glyph in each Shape's inscribed rectangle, handles at the side midpoints each Shape touches.

**Acceptance:** each Shape has a Ladle story and an application proof (ADR 0052); a test asserts every Shape in the set touches all four side midpoints of its bounding rect, so a later addition that does not fails.
