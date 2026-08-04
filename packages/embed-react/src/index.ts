/**
 * `@onrampfunds/embed-react` — a React wrapper around `@onrampfunds/embed`.
 *
 * Roughly forty lines around a ref and an effect, which is all it should be. Everything that
 * carries weight — the closed shadow root, the state machine, the contrast guard, the regulated
 * copy and its fallbacks — lives in the core package and is not reimplemented here.
 */

export { OnrampPrequalification } from './component';
export type { OnrampPrequalificationProps } from './component';

export { version as coreVersion } from '@onrampfunds/embed';

export type {
  CardState,
  EmbedEvent,
  Lexicon,
  MountConfig,
  MountHandle,
  ServedCopy,
  ThemeTokens,
} from '@onrampfunds/embed';

/** The version of this package. Matches the core it is pinned to. */
export const version = '0.0.4';
