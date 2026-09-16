import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `tailwind-merge` only recognises Tailwind's own class names when deciding
 * which of two conflicting utilities to keep, so a custom utility for the
 * chrome's structural scale (`rounded-chrome-*`, `text-chrome-*`,
 * `border-chrome-accent` — `packages/app/src/tailwind.css`) does not evict the
 * built-in class it is meant to replace: `twMerge('border', 'border-chrome-accent')`
 * keeps both, leaving two conflicting `border-width` declarations for the
 * compiled stylesheet's own rule order to arbitrate rather than the merge
 * this function exists to do (verified directly against `tailwind-merge`).
 * Registering each chrome utility under the built-in group it extends is what
 * restores that: `rounded-chrome-*` into `rounded`, `text-chrome-*` into
 * `font-size`, `border-chrome-accent` into `border-w`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [
        'rounded-chrome-2xs',
        'rounded-chrome-xs',
        'rounded-chrome-sm',
        'rounded-chrome-md',
        'rounded-chrome-lg',
        'rounded-chrome-xl',
      ],
      'font-size': ['text-chrome-2xs', 'text-chrome-xs', 'text-chrome-sm'],
      'border-w': ['border-chrome-accent'],
    },
  },
});

/** Merge conditional class names and de-duplicate conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
