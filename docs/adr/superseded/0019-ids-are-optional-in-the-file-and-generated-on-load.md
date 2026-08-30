# Ids are optional in the space file and generated on load

Status: superseded
Superseded by: 0030
Refines: 0010

Every referenceable thing in a space carries an **id** — one id, short and readable (ADR 0016 rejected a second, machine-facing one). Writing it is **optional**: a space file may omit any id, and `loadSpace` fills in what is missing, so a value that reaches the rest of the system always has one.

This exists because the file is hand-authored and the app is not the only thing that writes it. An author writing a space by hand should have to name only what they actually refer to. A route step naming a card needs that card to have an id; a card nobody points at needs nothing, and demanding one anyway is ceremony that makes the file-first story worse for no gain. Meanwhile everything downstream — the index `loadSpace` builds, a Layout's position map, a route's steps, anything that will address a card — needs an id unconditionally. Making the field optional at the edge and total after intake puts the asymmetry in exactly one place, which is the place ADR 0010 already established as the only way a Space comes into being.

Generation is **deterministic**: the same file yields the same ids every time. This is the whole reason it can be done at load rather than only at save. An id minted randomly per load cannot be referenced, bookmarked, or written into a Layout, because it would name something different next time — it would be an object identity, not an id. Determinism also keeps `loadSpace` pure and property-testable, which is the property that made the alternative unattractive: a random generator forces either injection at every call site or a global mock in a `beforeEach` that nothing at the call site admits to, and `crypto.randomUUID` is a CSPRNG and unseedable by design, so controlling it means owning it.

The alternatives. **Ids required in the file** is the status quo and is simply more work for an author with no benefit to anyone. **Ids generated only on save** was rejected because it means a hand-authored file that has never been through the app has entities that cannot be referred to at all, which is precisely the file the file-first story is about. And a second **generated identifier alongside the authored one** is ADR 0016, rejected: two identifiers per entity is more model than the problem needs.

The costs accepted. An id that was generated rather than written is indistinguishable in the file once saved, so an author cannot tell which names were theirs — the file is the same either way, which is the point, but it does mean generation must produce something a human would have been willing to write. Generation derives from what the author *did* write, so editing that content before the first save moves the id: ids only become durable once they are in the file. And because the file is the boundary, a space file that has never been saved has ids that exist only in memory.
