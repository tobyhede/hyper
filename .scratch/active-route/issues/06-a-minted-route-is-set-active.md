# A route minted by editing is set active explicitly

Status: blocked
Blocked by: ADR 0021 (drag-to-connect), not built

The first edge drawn in a space with no routes mints the route it lands in (ADR 0021), and the same gesture converts the algorithmic arrangement into a positioned Layout (ADR 0025). The Layout that comes into existence names the route that came into existence with it, in that one write (ADR 0028).

Not "the fallback would pick it anyway". It would — one route, so first-visible is the same answer — but the fallback is a read and this is a write, and the two agreeing today is a coincidence of there being exactly one route.

Nothing draws edges yet, so this cannot ship with the rest. It is a line inside 0021's implementation and belongs to that work; it lives here so the requirement is not lost between the two.
