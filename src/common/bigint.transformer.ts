import { ValueTransformer } from 'typeorm';

// pg returns bigint columns as strings; amounts are minor units and must stay exact.
export const bigintTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null | undefined): number | null | undefined => {
    if (value === null || value === undefined) return value;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`bigint value ${value} exceeds Number.MAX_SAFE_INTEGER`);
    }
    return parsed;
  },
};
