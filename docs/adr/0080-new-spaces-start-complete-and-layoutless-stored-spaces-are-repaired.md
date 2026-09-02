# New Spaces start complete, and layoutless stored Spaces are repaired

Status: accepted
Refines: 0079
Related: 0018, 0040, 0054, 0056, 0076, 0078

ADR 0079 correctly requires every working Space to carry a durable default
Layout, but incorrectly says a newly created Space *still* begins that way. The
code before ADR 0079 created one Card and no Layout. This decision makes the
complete new-Space shape a change rather than a continuation: every constructor
and provisioning path that knows Hyper is creating the Space creates `Layout 1`
and its empty Active `Graph 1` in the same value, records that Layout as the
default, and places the first Card at the canonical centred starting position.
The complete aggregate is persisted atomically, so it never enters repair and
never first opens on an empty canvas.

A stored or imported layoutless Space is different. Its first complete
working-state read persists an empty `Layout 1`, its empty Active `Graph 1`, and
the default selection before returning. Existing Cards remain outside that
Layout in the Cards View because the repository has no authored basis for
guessing their positions. A stored Space that already has Layouts but lacks a
default instead persists its first Layout in authored order as the default and
creates nothing.

This is one server-side first-working-load boundary shared by direct opening,
entering a Space Card, and rendering an open Space Card. Listing, import
completion, export, and reference validation continue to read stored state
without repair. Initialization uses the ordinary optimistic repository commit:
a concurrent winner is accepted after conflict reload, while retryable,
rejected, or failed persistence prevents the Space from becoming working state.

We reject inferring a new Space from its Card count. A one-Card import is still
an import, and a two-Card Space created by a future constructor is still new;
content is not provenance. We also reject storing a creation marker, because
the creation boundary already knows when it is constructing a new Space and can
persist the complete value directly.
