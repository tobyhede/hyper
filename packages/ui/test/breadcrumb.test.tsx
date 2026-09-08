import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from '../src/index';

const trail = (size?: 'default' | 'compact') => (
  <Breadcrumb>
    <BreadcrumbList size={size}>
      <BreadcrumbItem>
        <BreadcrumbPage>Here</BreadcrumbPage>
      </BreadcrumbItem>
    </BreadcrumbList>
  </Breadcrumb>
);

describe('BreadcrumbList', () => {
  it('carries the page type scale by default', () => {
    render(trail());

    expect(screen.getByRole('list').className).toContain('text-sm');
  });

  /**
   * The list is what sets the scale for every step inside it, so a trail
   * dropped into a command surface has to be able to join that surface's own
   * scale rather than imposing a page's on the controls beside it.
   */
  it('takes the command-surface scale on request', () => {
    render(trail('compact'));

    const { className } = screen.getByRole('list');
    expect(className).toContain('text-[13px]');
    expect(className).not.toContain('text-sm');
  });
});
