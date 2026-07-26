# `loadSpace` validates a Layout's route references

Status: resolved
Blocked by: 02

Two checks in `validateReferences`, and two `ReferenceErrorKind`s:

- every id in `layout.routes` names a route the space has;
- `activeRoute`, when present, is within the visible set — `layout.routes` if it filters, every route if it does not.

The first is the lookup that file already does several times over. The second is the only check in it that is a relation between two fields rather than a resolution against the space, so a Layout naming a real route it does not show is an error even though both ids resolve.

Message names the layout as well as the id, matching `layout-position-unknown-card`.

## Answer

`1bb84f1`. Two kinds rather than three: `layout-unknown-route` covers both dangling cases — a filter entry and an `activeRoute` — since the failure is identical, only the field differs, and the message says which. `layout-active-route-not-shown` is reserved for the case where both ids resolve and it is still an error.

The two are exclusive by construction: an `activeRoute` naming nothing is reported unknown and *not* also unshown, so an author gets one error naming one problem.

The empty-filter case falls out correctly without a special branch — `[]` is truthy, so `layout.routes && !layout.routes.includes(...)` reports. That is only right because `02` kept empty distinct from absent, and there is a test asserting it rather than leaving it to the reader to notice.
