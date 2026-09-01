# V1 exposes only Layouts, and first open initializes one

Status: accepted
Supersedes: 0031, 0045, 0072, 0075
Refines: 0014, 0015, 0053, 0064, 0068, 0069
Related: 0018, 0040, 0041, 0054, 0056

V1 exposes only authored **Layouts** as the selectable and addressable way to
see a Space. **Computed View** and the union term **Space View** leave the v1
domain, persisted selections, product URLs and application registry rather than
surviving as hidden compatibility machinery. A Space Card selects a Layout and
Graph, and the Space's persisted opening selection is its `defaultLayout`.
Obsolete Computed View identities are invalid input and obsolete product URLs
are not found; tracked sources, fixtures and generated state roll forward.

Layout strategies remain distinct from Layouts. The positioned strategy draws
an authored Layout, while automatic strategies remain non-addressable
capabilities for explicit operations or future work. V1 deliberately loses the
Computed View that flattened Graphs across Layouts: a canvas shows the selected
Layout and the Graphs that Layout owns.

A newly created Space still begins with one Card centered in an authored Layout
with its initial empty Active Graph. A stored or imported Space may instead have
no Layout. The first request for that Space's complete working state performs
one atomic persisted Edit before returning it: it creates and selects an empty
`Layout 1`, creates its empty `Graph 1`, makes that Graph active, and records the
Layout as `defaultLayout`. If Layouts already exist but no default is recorded,
the same boundary persists the first Layout in authored order as the default.
Listing, import completion, export and reference checks do not initialize a
Space. Import does not rewrite its source Markdown; explicit Export remains the
crossing back to repository-friendly files.

Initialization must commit before the Space becomes working state. A conflict
reloads the stored Space and accepts a competing initialization when one now
exists, otherwise it follows the normal retry policy; another commit failure
prevents the Space from opening. Opening through a Space Card, entering it or
rendering it inside an open Space Card all require the same initialized target.
A Space Card Edit cannot complete until the target supplies valid Layout and
Graph identities.

**Add Layout** is the explicit authoring operation for another Layout. It creates
and selects an empty Layout with one empty Active Graph in one Edit; existing
Cards remain outside it until added from the Cards View. A working Space always
has a durable default Layout, so its last Layout cannot be deleted. Choosing a
Layout remains navigation rather than an Edit; a later successful Edit in that
Layout may record it as the new default.

We reject keeping Computed Views hidden for later. Their supposedly dormant
IDs, schema cases, URL semantics, conversion path and renderer resolution would
preserve most of the complexity being removed. We also reject requiring every
import to author a Layout before Hyper accepts it: loading existing Markdown
Cards into an empty Layout is the streamlined manual-authoring path this
decision exists to provide. Finally, we accept that first open authors state.
ADR 0025 rejected that because merely viewing became indistinguishable from
editing; without Computed Views, a Layout is the state required to make the
Space usable, and completing that state before display is preferable to a
read-only or application-owned draft.
