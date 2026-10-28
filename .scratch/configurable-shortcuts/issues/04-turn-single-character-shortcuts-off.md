# 04: Turn single-character shortcuts off

Status: needs-triage

ADR 0138, WCAG 2.1.4. Depends on 03.

**What to build.** One switch, "Single-key shortcuts", stored as an override (03). While it is off, the dispatcher answers no binding whose key is a single letter, number, punctuation or symbol character pressed with no modifier but Shift: today that is `C`, `P`, `N`, `S` and `?`. Space, the arrows, Enter, F2, Delete, Home and the Page keys are unaffected, because 2.1.4 does not count them as character keys. Space needs saying: in the table its key is `' '`, one character long, so the rule is not a length test. Space is named as exempt.

**Question for triage.** With `?` off, the sheet needs another way in. It could be a Dock control that opens the sheet, which the sheet's tooltip work (`.scratch/keyboard-shortcuts/issues/07`) may already offer, or a non-character binding such as `Shift+F1`. Decide before building.

**Done when.** An e2e test turns the switch off, presses `C` and `P` on the canvas and sees nothing happen, presses Space on a focused Resource and sees Full View open, reloads and sees the switch still off, and then turns it back on.
