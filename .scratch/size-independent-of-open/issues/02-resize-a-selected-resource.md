# 02: Resize any selected Resource

**What to build:** the existing bottom-right resize control is offered on a selected Resource, Open or Closed, any kind, wherever its Map may be authored — no longer gated on Open — and not on an unselected one. A selected Resource in a Shape other than the rectangle draws a thin rectangular border around its rect, so the control sits on that border's corner. The control's look and the Edge handles are unchanged.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Decoration offers resize on selection, not on Open; read-only Maps offer none.
- [ ] The Shape border on selection, with Ladle and application proofs (ADR 0052).
- [ ] Playwright: resize a Closed Resource and it stays Closed; Open keeps the size; a Shape's control sits on its border's corner.
