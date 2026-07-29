import { uuidSchema, type UUID } from '@project/core';

export const uuid = (value: string): UUID => uuidSchema.parse(value);
