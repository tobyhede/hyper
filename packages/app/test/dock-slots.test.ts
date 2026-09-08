import { describe, expect, it } from 'vitest';
import { DOCK_ALONGS, DOCK_EDGES, dockSlot, slotValue } from '../stories/review/dock-model';

/**
 * The slots the Command Dock's grip offers, and the round trip through the menu.
 *
 * A radio item carries a string, and Base UI hands that string back as `any`
 * (`MenuRadioGroup`'s `onValueChange`), so the value the Dock reads on the way
 * out is untrusted however it was written on the way in. Parsing it is right.
 * What has to be *proved* is that the parse cannot fail for anything the menu
 * itself rendered — otherwise the boundary's `null` arm is a live branch that
 * silently does nothing, and a reader who picks a slot watches the grip ignore
 * them.
 *
 * So the test generates the offered set the same way the menu does and holds
 * every member to a round trip. The `null` arm stays, and this is what says it
 * is unreachable from the menu rather than merely unlikely.
 */
describe('the slots the Command Dock offers', () => {
  it('parses every value the menu renders back to the position it names', () => {
    const offered = DOCK_EDGES.flatMap((edge) => DOCK_ALONGS.map((along) => ({ edge, along })));

    // Four edges, three stops each. Stated rather than derived: the count is
    // what a reader checks the menu against, and deriving it from the same two
    // arrays would assert nothing.
    expect(offered).toHaveLength(12);
    for (const position of offered) {
      expect(dockSlot(slotValue(position))).toEqual(position);
    }
  });
});
