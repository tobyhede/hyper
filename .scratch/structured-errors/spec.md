# Structured errors

Implement ADR 0057 across Space Authoring, application presentation and the
HTTP persistence protocol. Expected failures retain stable identities and typed
context until the application chooses wording and placement; HTTP failures use
RFC 9457 Problem Details.

The work is complete when no caller branches on refusal prose, every current
Authoring refusal belongs to an exhaustive closed union, Card Editor validation
is field-local, persistence feedback remains workspace-owned, and every
non-conflict HTTP error response and decoder uses `application/problem+json`.
