# 07 — Connect from the keyboard

Status: needs-triage

**What to build:** A Connect command on a Resource's toolbar that opens a "Connect to" `ResourceSearchCombobox` over the Map's Resources — refused ones listed and disabled with their reason, through `resourceChoiceOf` and Edge eligibility — creating the Edge in the Active Graph, with a "New Resource" row as the keyboard form of Alt-drop.

**Why:** With reconnect dropped, drawing an Edge is the one way to change one, and it must be reachable without a pointer (ADR 0073). A keyboard connect existed (`keyboard-connect` draft, a "Connect to" combobox) and went out in `1212feb88` with the expanded-cards integration, apparently as collateral; `70c60e4fc` holds its tests.

Open: an icon on the Resource toolbar, or a row in the Resource's `⋯` menu.
