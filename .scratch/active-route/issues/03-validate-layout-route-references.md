# `loadSpace` validates a Layout's route references

Status: open
Blocked by: 02

Two checks in `validateReferences`, and two `ReferenceErrorKind`s:

- every id in `layout.routes` names a route the space has;
- `activeRoute`, when present, is within the visible set — `layout.routes` if it filters, every route if it does not.

The first is the lookup that file already does several times over. The second is the only check in it that is a relation between two fields rather than a resolution against the space, so a Layout naming a real route it does not show is an error even though both ids resolve.

Message names the layout as well as the id, matching `layout-position-unknown-card`.
