# UUID identity types: TypeScript, Zod, and Prisma

## Conclusion

TypeScript has no nominal `uuid` primitive. The strongest design is therefore:

1. validate external values at every trust boundary;
2. return an opaque/branded string only after validation; and
3. let domain code accept the branded output, never an unchecked `string`.

For Hyper's currently stated invariant—one durable UUID identity shared by all
referenceable entities—the proportionate implementation is a single Zod brand:

```ts
export const uuidSchema = z.string().uuid().brand<'UUID'>();
export type UUID = z.output<typeof uuidSchema>;
export type UUIDInput = z.input<typeof uuidSchema>; // string
```

All JSON, generated UUIDs, and database results cross `uuidSchema.parse` or a
larger schema containing it. A branded `UUID` remains assignable to APIs that
accept `string`, including Prisma; an ordinary `string` is no longer assignable
to domain identity fields.

The absolute maximum static safety is to layer entity brands on the validated
UUID (`UUID & CardId`, `UUID & RouteId`, and so on), which additionally rejects
mixing valid IDs of different entity kinds. That is a distinct domain decision,
not a requirement for proving UUID validity. Hyper explicitly describes a
single durable identity and asks for MVP scope, so the single `UUID` brand is the
best current trade-off. Entity-specific brands can be added if cross-kind ID
mix-ups become a demonstrated risk.

## What is idiomatic in TypeScript

TypeScript is structurally typed. Its official nominal-typing playground uses
an intersection with a brand property to distinguish validated strings from
ordinary strings, explicitly giving identification numbers and validated user
input as use cases. This is a conventional simulation of nominal typing, not a
built-in UUID feature. ([TypeScript nominal typing example](https://www.typescriptlang.org/play/typescript/language-extensions/nominal-typing.ts.html))

Zod directly supports the same pattern with `.brand()`. Its documentation says
the purpose is to accept only values validated by Zod; the brand is static-only
and does not change the parsed runtime value. ([Zod branded types](https://v3.zod.dev/?id=brand))

The installed Zod 3.25.76 tests also prove the important boundary behavior:
`z.input` remains the unbranded primitive while `z.infer`/output carries the
brand. ([installed Zod brand tests](../../packages/core/node_modules/zod/src/v3/tests/branded.test.ts#L41))

This makes a schema-owned brand more idiomatic here than a hand-written
`unique symbol` plus scattered `as UUID` assertions: the runtime validator and
the static proof have one owner. Assertions should be absent from application
call sites; they defeat the proof.

## Prisma ORM

Prisma ORM does not expose or recommend a branded UUID TypeScript type. In its
schema, PostgreSQL `uuid` is a native mapping of the Prisma `String` scalar via
`@db.Uuid`, and the documented Prisma Client JS type for `String` is `string`.
`uuid()` selects UUID generation; it does not change the generated TypeScript
type. ([Prisma schema reference: `String`, `@db.Uuid`, and client type](https://www.prisma.io/docs/orm/reference/prisma-schema-reference#string),
[Prisma schema reference: `uuid()`](https://www.prisma.io/docs/orm/reference/prisma-schema-reference#uuid))

Consequently, Prisma provides database/query type safety but not the domain
claim “this string has been UUID-validated.” The application must add that
claim at its repository boundary. Database UUID columns make malformed stored
values impossible, but parsing their `string` result is still the clean way to
mint the domain brand without an unchecked assertion.

## Prisma Next 0.16.0 (experimental, pinned here)

Prisma Next must be distinguished from Prisma ORM. Its official contract syntax
also defines the reusable UUID alias as `Uuid = String @db.Uuid`; the alias
centralizes storage selection rather than creating a nominal TypeScript value.
([Prisma Next PSL named types](https://www.prisma.io/docs/orm/next/contract-authoring/psl-syntax#named-types))

The installed 0.16.0 implementation is unambiguous:

- `PgUuidCodec` declares both input and output as `string` and encodes/decodes
  them unchanged. ([installed UUID codec](../../node_modules/@prisma-next/target-postgres/src/core/codecs.ts#L1011))
- Hyper's emitted contract consequently obtains relational IDs through
  `CodecTypes['pg/uuid@1']['input' | 'output']`, which resolves to `string`.
  ([emitted contract](../../src/prisma/contract.d.ts#L46))
- Prisma Next itself uses brands where it wants nominal identity—for contract
  hashes and `NamespaceId`—including a single, documented assertion/factory
  site. ([installed brand helper](../../node_modules/@prisma-next/contract/src/types.ts#L1),
  [installed `NamespaceId`](../../node_modules/@prisma-next/contract/src/namespace-id.ts#L1))

Thus Prisma Next neither brands nor validates PostgreSQL UUID values for the
domain. Its own source does, however, corroborate branding as an accepted
TypeScript technique for identities whose nominal distinction matters.

## Implication for issue 01

Changing Hyper's current `z.string().uuid()` to a Zod-branded UUID closes the
remaining static hole while preserving all wire, JSONB, PostgreSQL, and Prisma
representations as strings. Repository reads should construct the full
`SpaceSnapshot` and parse it through the normal domain intake; direct relational
IDs used independently (for example `listSpaces`) should cross `uuidSchema`
before being returned. Generated values such as `crypto.randomUUID()` should do
the same. Compile-time tests should prove that plain strings cannot populate
identified domain shapes.
