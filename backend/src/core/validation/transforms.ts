import { Transform } from 'class-transformer';

/**
 * Treats an empty string as "not provided", so `@IsOptional()` skips it. Used on optional date/ID fields that HTML
 * inputs submit as '' when left blank (the services already treat '' and undefined the same way).
 */
export const EmptyToUndefined = () => Transform(({ value }) => (value === '' ? undefined : value));

/** Spreadsheet cells parsed by xlsx can arrive as numbers; coerce them to strings for string columns. */
export const NumberToString = () => Transform(({ value }) => (typeof value === 'number' ? String(value) : value));
