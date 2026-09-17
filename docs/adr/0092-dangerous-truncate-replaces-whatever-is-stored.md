# Dangerous truncate replaces whatever is stored

Status: accepted
Refines: 0078

`--dangerous-truncate` truncates. Replacement deletes everything stored and
writes the imported aggregate in its place, atomically, whether or not the
stored state is a valid aggregate. That includes Spaces stored without a Meta
identity, a stored aggregate that fails complete intake, and a stored document
that does not parse.

ADR 0078 said contradictory stored state "remains an invariant failure rather
than either outcome" for `replaceAggregate` as well as for reading and
initialization. In practice the command could not reach replacement at all:
it authorized replacement with the Meta identity `loadAggregate` reported, and
`loadAggregate` throws on exactly the state an operator most needs to replace.
So a flag whose whole meaning is permission to destroy what is stored refused
to destroy it, and the only recovery left was outside the tool.

What does not change:

- Reading and initializing still fail contradictory stored state as an
  invariant, and neither treats it as empty or overwrites it. Without the flag
  an import leaves stored state exactly as it is.
- An invalid *proposed* aggregate is refused before anything is deleted.
- Replacement is still authorized by the Meta identity the caller just read,
  and a different identity stored by the time it writes is a conflict. That
  identity is now read by `loadMetaSpaceId`, which returns the stored Meta
  identity without validating the aggregate around it, or none. A caller that
  read none may replace Spaces stored without Meta; a caller that read one gets
  a conflict if it has since gone.
- An empty repository is still `uninitialized` to replacement, and the command
  then initializes, so first state still comes only from `initializeAggregate`.

Rejected: making replacement unconditional, dropping the identity check. The
flag authorizes destroying the state the operator's command read, not state
another host or command established in between.
