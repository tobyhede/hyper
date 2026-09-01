# Space Authoring owns the complete Edit lifecycle

Status: accepted
Refined by: 0041, 0042, 0076
Related: 0025, 0028, 0030, 0031, 0033

An **Edit** is a validated transition from one Space to another; **Authoring** is
the interaction that may produce one. Hyper puts the complete lifecycle behind
one deep, framework-neutral Space Authoring module in `packages/app`. The module
owns eligibility, authoritative on-screen placement, Edit derivation and
validation, Card/Route/Layout identity minting, optimistic submission, retry,
conflict acceptance, reentrant completion and external publication. React and
React Flow types do not cross its interface, and one application caller does
not justify a new package seam.

The render adapter installs its authoritative completed placement before it
notifies Space Authoring what happened. The notification carries the completed
authoring fact — a settled Card movement, an Edge between existing Cards, or a
create-and-connect — but no snapshot, Route id, Layout id, conversion flag or
effect plan. Space Authoring reads the current placement, navigation and working
Space, derives the whole next snapshot, validates it through normal Space intake
and installs it as one Edit. Cancelled, duplicate, zero-movement and stale-
context attempts produce no Edit and do not throw. Future deletion work adds its
own authoring fact when it exists; this decision creates no generic command
system in anticipation of it.

`SpaceSession.working` is the sole authoritative authored snapshot. The
navigation module holds no second Space copy and absorbs the former
`ViewChoice`; it owns selected renderer, active Route, walk, presenting state and
opened Card. Space Authoring is the only application module allowed to mutate
the session. It also reads and updates navigation when an Algorithmic View
converts to a Layout or the first Route is minted. The UI reads persistence
state and invokes retry or conflict acceptance through Space Authoring rather
than changing the session behind it.

Internal installation preserves valid intermediate state: completed placement
is already authoritative, the validated working Space is installed next, and
navigation changes only after the Layout or Route it names exists. External
subscribers see one publication after the complete optimistic Edit is installed;
they never observe those intermediate steps. A completion arriving reentrantly
is queued and derived from the fully installed preceding state. Observer
notifications are non-throwing by contract: an observer failure is reported
separately and cannot prevent persistence from starting. Only failure to derive
a valid Space from authoritative state rejects synchronously before the Space
changes. Persistence failure remains asynchronous visible state and does not
disable further Authoring.

The React Flow adapter continues to own pointer attempts, transient node state,
measurements and visual selection. It projects node handle declarations and
Edges as one coherent adapter state. Consequently the first Route UUID is minted
only when its Edit succeeds: no future id is reserved merely to make old nodes
anticipate an Edge that a later render publishes. The existing real-browser
first-connection, consecutive-connection and warning-008 coverage protects this
adapter requirement.

Accepting the current stored Space after an optimistic conflict is a replacement,
not an Edit. Space Authoring resets placement from that Space and navigation
opens it afresh at its default renderer and active Route, with no walk or opened
Card. The application is not remounted.

## Consequences

`App` renders subscribed state and forwards interactions; it no longer executes
the authoring protocol or mutates `SpaceSession` directly. The existing
`createPlacementEditor`, `EditorStore` and `ViewChoice` interfaces are replaced
rather than retained behind shallow compatibility modules. Most tests that
assemble their collaborators are likewise replaced by tests through the Space
Authoring interface, while browser tests retain responsibility for React Flow
gesture translation, declared handles and coherent node/Edge publication.

We rejected keeping the duplicate runtime Space, passing proposed snapshots
through authoring notifications, exposing identity generators as setup, adding
a speculative package or command seam, and preserving the old interfaces during
the cutover. Each would keep lifecycle knowledge distributed across callers
instead of buying leverage and locality from the deeper module.
