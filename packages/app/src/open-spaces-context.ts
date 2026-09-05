import { createContext, useContext } from 'react';
import type { OpenSpaces } from './open-spaces';

/** Isolated single-Space mounts have no session-wide command surface. */
export const OpenSpacesContext = createContext<OpenSpaces | null>(null);
export const useOpenSpaces = (): OpenSpaces | null => useContext(OpenSpacesContext);
