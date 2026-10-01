# 04: Delete Edge asks first

**What to build:** Deleting Edges asks first, from both gestures: the Edge toolbar's Delete and the Delete key on a canvas selection of Edges. One question covers the whole selection — `Delete {Edge}?` for one Edge, `Delete {n} Edges?` for several — and says the Edges are permanently deleted from their Graph. Delete runs the existing Edge deletion; Cancel and Escape run nothing and return focus to where the gesture was made.

**Blocked by:** 01 — One delete confirmation for every kind of subject

**Status:** done

- [x] The Edge toolbar's Delete asks before it runs, naming the Edge.
- [x] The Delete key on a selection of Edges asks once for the selection, naming one Edge or counting several.
- [x] Cancel and Escape leave every selected Edge in place and the selection intact.
- [x] The Delete key on a selected Resource still runs Remove from Map without a question — Remove from Map is not a deletion.
- [x] Existing Edge deletion journeys pass through the confirmation.
