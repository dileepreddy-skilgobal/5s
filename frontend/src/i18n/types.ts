import type { Messages } from './messages/en';

/** Every level optional: other locales may leave keys out and fall back to English. */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> };

/** Dotted paths of every leaf string, e.g. "nav.locations" | "common.save". */
type Leaves<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
}[keyof T & string];

type AllLeaves = Leaves<Messages>;

/** "notifications.markedCount_one" -> "notifications.markedCount" (call plural keys without the suffix). */
type PluralBase<K> = K extends `${infer Base}_${'zero' | 'one' | 'two' | 'few' | 'many' | 'other'}` ? Base : never;

export type MessageKey = AllLeaves | PluralBase<AllLeaves>;

export type TranslateParams = Record<string, string | number | null | undefined>;

export type TranslateFn = (key: MessageKey, params?: TranslateParams) => string;
