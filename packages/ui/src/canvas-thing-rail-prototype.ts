// THROWAWAY: rendering seam for the floating Thing dock review.
import { createContext, type ReactNode } from 'react';

export const CanvasThingRailPrototype = createContext<
  (rail: ReactNode, openSpace: boolean) => ReactNode
>((rail) => rail);
