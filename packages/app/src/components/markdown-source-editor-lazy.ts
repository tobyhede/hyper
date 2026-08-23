import { lazy } from 'react';

export const MarkdownSourceEditor = lazy(async () => {
  const module = await import('@project/ui/MarkdownSourceEditor');
  return { default: module.MarkdownSourceEditor };
});
