# The unreleased prototype rolls forward

Status: accepted
Refined by: 0056, 0077

Hyper has no old documents to preserve. Its only data are fixtures kept with the
prototype, so authored document changes roll forward with those fixtures rather
than carrying versioned readers, transitional keys, or migrations for earlier
document shapes.

This is deliberately surprising. The space format carries a version literal,
the intake has a document-refusal gate, and `migrations/app/` exists. Those
signals normally imply a compatibility obligation. Here they prepare and define
the system; they do not describe shipped data or an installed user base. The
accepted cost is that an untracked, hand-authored document using an old shape can
stop loading without a tailored compatibility error.

We rejected versioned readers and transitional aliases because they would turn
fixture maintenance into a permanent product contract before the product is
released. A format change updates the schema, fixtures, examples, and tests in
one roll-forward change instead.

This decision is only about document backwards compatibility while Hyper is an
unreleased prototype. It does not remove relational schema management:
`migrations/app/` and the Prisma-next contract remain how the PostgreSQL schema
is defined and applied. It is not licence to delete them or to skip a migration
when the relational schema changes.
