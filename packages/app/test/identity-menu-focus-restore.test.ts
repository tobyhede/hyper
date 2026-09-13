import { describe, expect, it, vi } from 'vitest';
import { identityMenuRestoresFocusOnClose } from '../src/components/identity-menu-focus-restore';

describe('identityMenuRestoresFocusOnClose', () => {
  it('suppresses trigger restoration once New Diagram has moved the caret', () => {
    const identityRestoresFocusOnClose = vi.fn(() => true);

    expect(identityMenuRestoresFocusOnClose(() => true, identityRestoresFocusOnClose)()).toBe(
      false,
    );
    expect(identityRestoresFocusOnClose).not.toHaveBeenCalled();
  });

  it('delegates to the identity caret flag otherwise', () => {
    const identityRestoresFocusOnClose = vi.fn(() => false);

    expect(identityMenuRestoresFocusOnClose(() => false, identityRestoresFocusOnClose)()).toBe(
      false,
    );
    expect(identityRestoresFocusOnClose).toHaveBeenCalledOnce();
  });
});
