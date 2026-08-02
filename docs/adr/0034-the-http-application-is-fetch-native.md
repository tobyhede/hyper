# The HTTP application is Fetch-native

Status: accepted
Related: 0030

Hyper's HTTP application is a Hono application whose interface is the Web
Fetch model. It exports its inferred route type for a typed browser client,
while runtime schemas still validate every value crossing the network. Runtime
hosts adapt the application to their environment; the current Node 24 and
Vite/Connect wiring are prototype composition, not architectural constraints.

Hono is preferred over Express and Fastify because Hyper values the broadest
practical runtime surface and a typed server/client contract. Express is the
most direct fit for the current Connect host and Fastify is a strong Node-owned
server, but either would make Node server interfaces part of the route module
without a product requirement for that commitment.

The portable route module does not own asset serving, process lifecycle,
WebSocket upgrades, log destinations or rate-limit storage. Those concerns sit
in runtime adapters and deployment composition. A concrete persistence adapter
may also narrow the runtimes available to one deployment without narrowing the
HTTP application itself.

## Consequences

The shared HTTP module owns routing, request policy, response mapping and the
typed client contract behind one small interface. It contains no `node:` or
Vite imports. Node, Worker, Bun, Deno or other hosts are supported only when a
tested adapter and compatible persistence composition exist; Hono advertising
an adapter is not by itself a Hyper support promise.

The current raw Node handler remains only until
`.scratch/fetch-native-http/issues/04-remove-the-raw-node-http-stack.md` — remove
the raw Node HTTP stack — is completed. Every runtime already serves the Hono
application; what is left is the deletion that ticket owns. Its manual JSON
buffering, media-type parsing and `Promise<boolean>`-for-fallthrough interface
are not compatibility contracts.
