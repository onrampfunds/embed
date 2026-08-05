/** Kept in sync with package.json by `scripts/check-lockstep-versions.mjs`. */
export const VERSION = '0.0.6';

/** Prefix for every console message, so a partner can tell whose warning it is. */
export const LOG_PREFIX = '[onramp-embed]';

/** Custom property names installed on the card root inside the shadow tree. */
export const CSS_VARS = {
  accent: '--orf-accent',
  accentText: '--orf-accent-text',
  surface: '--orf-surface',
  text: '--orf-text',
  border: '--orf-border',
  radius: '--orf-radius',
  fontStack: '--orf-font',
} as const;

/** Used when the partner omits a token, and when one fails validation or the contrast guard. */
export const DEFAULT_TOKENS = {
  accent: '#3a2fd0',
  accentText: '#ffffff',
  surface: '#ffffff',
  text: '#16181d',
  border: '#e3e5ea',
  radius: '8px',
  fontStack: 'system-ui, sans-serif',
} as const;

export const FONT_KEYWORDS: Record<string, string> = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

/**
 * Every `color-mix` weight the stylesheet uses, in one place, so the contrast guard checks the
 * tones that actually render rather than an approximation of them.
 */
export const MIX = {
  /** Attribution row. */
  attribution: 58,
  /** Treatment B eyebrow. */
  eyebrow: 60,
  /** Departure notice under the action. */
  departure: 62,
  /** Disclosure footer text — the tightest pairing on the card. */
  disclosure: 66,
  /** Disclosure footer fill. */
  disclosureFill: 3.5,
  /** Expired reason line. */
  expiredReason: 72,
  /** Mechanism line. */
  mechanism: 80,
  /** Qualifier band fill. */
  bandFill: 9,
  /** Qualifier band border. */
  bandBorder: 26,
  /** Mechanism vertical rule. */
  mechanismRule: 40,
  /** Action border, mixed toward black. */
  ctaBorder: 82,
  /** Skeleton blocks, mixed from `border`. */
  skeletonSoft: 55,
  skeletonMid: 70,
  skeletonStrong: 85,
} as const;

/** WCAG 2.1 AA. */
export const CONTRAST = {
  /** Body text. */
  body: 4.5,
  /** Large text and non-text boundaries. */
  large: 3,
} as const;

/** The accessible name of the card root. It has to make sense read alone, out of context. */
export const REGION_LABEL = 'Working capital pre-qualification from Onramp Funds';
