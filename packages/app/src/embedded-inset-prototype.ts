// THROWAWAY: lets the floating-dock review compare embedded viewport geometry.
import { createContext } from 'react';
import { SPACE_THING_EMBED_INSET } from '@project/core';

export const EmbeddedInsetPrototype = createContext<{
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}>(SPACE_THING_EMBED_INSET);
