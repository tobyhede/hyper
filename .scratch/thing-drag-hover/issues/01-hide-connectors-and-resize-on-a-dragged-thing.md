# 01 — Hide connectors and resize on a dragged Thing

**What to build:** While a Thing is being moved, return its hover chrome to rest: no Graph connector handles and no resize control, even if the pointer is still over it and it is selected. The dragging face (tilt and shadow) stays. Rail actions already hide during drag and must keep doing so. This is the dragged Thing only.

**Blocked by:** None — can start immediately

**Status:** done

- [x] A Thing being moved draws as dragging and does not reveal Graph connector handles or the Open resize control, including when it is hovered and selected.
- [x] Hover and Selection still reveal those affordances on a Thing that is not being moved.
- [x] Rail actions remain hidden for the duration of the drag.
- [x] Connection drags are unchanged: seeking-end handles still appear on eligible neighbours; this ticket does not alter that gesture.
- [x] Anchors stay mounted. Hide them with opacity (or equivalent), never `display: none` — React Flow measures handles, and a display-none handle reports 0×0.
- [x] Other Things under the pointer during the drag are out of scope. The Dock grip drag is out of scope.
- [x] Use the existing Thing node and canvas handle/resize reveal. No new menu, control or interaction model.
- [x] Application and Ladle behaviour evidence covers a live node drag, not only the static dragging specimen, and still covers hover and Selection reveal when the Thing is at rest.
