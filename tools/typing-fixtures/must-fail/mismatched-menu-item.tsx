/**
 * A menu item bound to its group's value type refuses a value that group could
 * not produce.
 *
 * The one fixture here about a seam rather than a repo-wide rule, and it earns
 * the place: `DropdownMenuRadioGroup` absorbs Base UI's `any` so that no
 * consumer launders the value handed back to it, and that promise is only worth
 * the compiler error standing behind it. Ticket `03` retired the runtime lookups
 * the Dock's menus used to re-parse their own values with, on the strength of
 * this gate. If the item's generic is ever dropped — `value` returning to Base
 * UI's `any` — this fixture compiles, `must-fail` reports the gap, and the
 * lookups are owed back.
 *
 * Imported by relative path rather than through `@project/ui`: the barrel pulls
 * five side-effect CSS imports into this program, which has no `vite/client`
 * types and reports every one of them. Nothing in the application imports this
 * file, which is the direction the README's rule runs in.
 *
 * **It does not prove the composition safe.** Binding is the caller's to
 * remember: an item written without the type argument infers its own, and
 * `.scratch/command-dock/findings/adversarial-dock-review-2026-09-10.md` (ACR-8)
 * holds the call sites that still have to.
 */
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '../../../packages/ui/src/components/dropdown-menu';

/** A branded id, as `DiagramId` and `GraphId` are — the shape the Dock's menus deal in. */
type DiagramId = string & { readonly __brand: 'DiagramId' };

declare const diagramId: DiagramId;

/** Bound once, the way a surface rendering several items binds it. */
const DiagramItem = DropdownMenuRadioItem<DiagramId>;

export const menu = (
  <DropdownMenuRadioGroup<DiagramId> value={diagramId}>
    <DiagramItem value="none">Not a DiagramId</DiagramItem>
  </DropdownMenuRadioGroup>
);
