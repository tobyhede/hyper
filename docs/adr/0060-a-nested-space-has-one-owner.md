# A nested Space has one owner

Status: superseded
Superseded by: 0068
Refines: 0058
Related: 0030, 0059

A Space may be named by at most one Space Card. The root Space has no owner;
every reachable nested Space has exactly one. Ownership therefore forms a tree,
not a general directed graph.

Recursive-Space aggregate intake validates this invariant across both stored
state and the complete proposed transaction before any write. Import applies
the same check while creating root links. A duplicate owner rejects the whole
operation.

This uniqueness is required before cascading deletion is enabled. With one
owner, removing a Space Card identifies one unambiguous descendant subtree;
without it, deletion could destroy a Space another Card still reaches.
