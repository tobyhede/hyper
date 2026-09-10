import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from '../src/index';

/**
 * The registry's own orientation spelling, and why this file exists.
 *
 * `@shadcn/field` balances the description on `group-has-data-horizontal/field:`
 * — a group with a *descendant* carrying a bare `data-horizontal`. Nothing in
 * this tree emits that attribute: `Field` writes its orientation as
 * `data-orientation`, which is what `tabs.tsx` and `separator.tsx` already read.
 * Left as generated the rule is inert and a horizontal field's description never
 * balances, which is invisible until someone looks.
 *
 * What is asserted here is the attribute the corrected selector depends on, the
 * way `Separator.test.tsx` asserts its own. The selector itself is not: jsdom
 * has no layout, so a class assertion would restate the source line rather than
 * catch the defect, and the defect is one only the surface shows.
 */
describe('Field', () => {
  it('marks its orientation with the attribute the rest of the tree reads', () => {
    render(<Field orientation="horizontal" data-testid="field-under-test" />);

    expect(screen.getByTestId('field-under-test')).toHaveAttribute(
      'data-orientation',
      'horizontal',
    );
  });
});
