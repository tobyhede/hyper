/**
 * Delete every row owned by a SQL Space repository without reading document
 * columns. Corrupt-document tests depend on cleanup remaining able to remove
 * rows whose JSON codecs cannot decode them.
 */
export const clearSqlContent = async (operations: {
  readonly deleteMetaIdentity: () => Promise<void>;
  readonly listSpaceIds: () => Promise<readonly { readonly id: string }[]>;
  readonly deleteResources: (spaceId: string) => Promise<void>;
  readonly deleteSpace: (spaceId: string) => Promise<void>;
}): Promise<void> => {
  await operations.deleteMetaIdentity();
  for (const { id } of await operations.listSpaceIds()) {
    await operations.deleteResources(id);
    await operations.deleteSpace(id);
  }
};
