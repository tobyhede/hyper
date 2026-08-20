export const captureError = async <T>(operation: () => Promise<T>): Promise<Error | undefined> => {
  try {
    await operation();
    return undefined;
  } catch (error) {
    // Every path under test throws one of this module's own Error subclasses;
    // a non-Error throw would be a bug in the code under test, not something
    // to paper over by wrapping it into a generic Error that loses its shape.
    if (error instanceof Error) return error;
    throw error;
  }
};
