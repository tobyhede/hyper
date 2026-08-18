import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;

const mobileQuery = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const subscribe = (listener: () => void): (() => void) => {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};

const getSnapshot = (): boolean => window.matchMedia(mobileQuery).matches;

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
