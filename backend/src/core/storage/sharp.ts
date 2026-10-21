/**
 * sharp >= 0.35 publishes ESM-first type declarations, which this CommonJS project would pick up by
 * default. The CommonJS build is what actually loads at runtime, so its own declarations are used.
 */
import type SharpCjs = require('sharp/dist/index.cjs');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof SharpCjs = require('sharp');

export = sharp;
