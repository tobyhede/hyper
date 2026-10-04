# 02 — Diamond on the canvas

Status: ready-for-agent
Blocked by: 01

**What to build:** a Shape choice in the Resource's Actions menu on its rail, drawn with `ChoiceMenu`, listing the five Shapes with the current one selected; each choice completes the Edit from 01. It is offered while Open as well as Closed. A Closed Resource whose Shape is `diamond` draws a diamond inside the fixed Closed Size; its Title Lines and kind glyph lay out in the inscribed rectangle and truncate as they do now. Handles stay at the side midpoints, which the diamond touches. An Open, editing or presented Resource draws as a rectangle whatever its Shape, and the diamond returns on Close. Every other Shape still draws as the rectangle until 03.

Start with `$shadcn-first-ui`; the outline treatment needs a design-system inventory entry or an `@project/ui` build (ADR 0052).

**Acceptance:** application E2E chooses Diamond from the Actions menu, sees the Closed diamond survive reload, Opens it to a rectangle and Closes it back to a diamond, and draws an Edge to it that meets the outline; unit tests cover the menu's selection and the Open/presented rectangle rule.
