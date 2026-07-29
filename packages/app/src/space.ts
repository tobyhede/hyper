import { cardFiles, spaceFile } from 'virtual:space-file';
import { openImportedWorkspace, type OpenedSpace } from './open-workspace';

export type { OpenedSpace } from './open-workspace';

/** List, load and open the first workspace through the configured backend. */
export const openWorkspace = (): Promise<OpenedSpace> =>
  openImportedWorkspace(spaceFile, cardFiles);
