/**
 * Ladle is Hyper's static production-component catalogue. Stable stories are
 * production-parity evidence under ADR 0052; the parity inventory and runtime
 * enforcement are delivered by design-system baseline Issue 08.
 */
export default {
  stories: 'stories/**/*.stories.tsx',
  viteConfig: import.meta.dirname + '/../ladle-vite.config.ts',
  port: 61000,
  previewPort: 61001,
  storyOrder: ['space-*', 'components-*', 'surfaces-*', 'review-*'],
  addons: {
    a11y: { enabled: true },
    theme: { enabled: false, defaultState: 'light' },
    rtl: { enabled: false },
    msw: { enabled: false },
  },
};
