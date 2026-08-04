import { contrastRatio, mixOklab, parseColor, pickReadableInk, toCssColor, type RGBA } from './color';
import { CONTRAST, DEFAULT_TOKENS, FONT_KEYWORDS, LOG_PREFIX, MIX } from './constants';
import type { ThemeTokens } from './types';

export type TokenKey = keyof typeof DEFAULT_TOKENS;

export interface ResolvedTheme {
  tokens: Record<TokenKey, string>;
  /**
   * The last-resort fallback: neutral text and surface, the accent demoted to a 3px top rule, and
   * the action filled with ink. Reached only when the body pairing itself cannot be rescued.
   */
  safeMode: boolean;
  warnings: string[];
  /** Measured ratios, exposed for tests and for anyone auditing the guard. */
  ratios: Record<string, number>;
}

const COLOR_KEYS = ['accent', 'accentText', 'surface', 'text', 'border'] as const;

/** A CSS length we are willing to interpolate into a stylesheet. */
const LENGTH = /^(0|[0-9]{1,4}(\.[0-9]{1,3})?(px|rem|em))$/;

/**
 * Upper bound on a corner radius, applied to the number and the string forms alike — `400` and
 * `'400px'` describe the same corner and must be treated the same way.
 */
const MAX_RADIUS = 200;

/** Conservative: font families, separators, and quotes. No parens, semicolons, or braces. */
const FONT_STACK = /^[\w\s,'"-]{1,200}$/;

function sanitizeRadius(input: unknown): string | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0 || input > MAX_RADIUS) return null;
    return `${input}px`;
  }
  if (typeof input !== 'string') return null;
  const value = input.trim().toLowerCase();
  if (!LENGTH.test(value)) return null;
  const magnitude = parseFloat(value);
  return Number.isFinite(magnitude) && magnitude >= 0 && magnitude <= MAX_RADIUS ? value : null;
}

function sanitizeFont(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (value.length === 0) return null;
  const keyword = FONT_KEYWORDS[value.toLowerCase()];
  if (keyword !== undefined) return keyword;
  return FONT_STACK.test(value) ? value : null;
}

interface Check {
  name: string;
  fg: RGBA;
  bg: RGBA;
  min: number;
  /** `block` failures drop the card into safe mode; `warn` failures are only logged. */
  severity: 'block' | 'warn';
}

/**
 * Resolves partner tokens into the values the stylesheet will use, correcting anything that fails
 * WCAG AA on the way.
 *
 * The ladder is the one the design handoff recommends:
 *
 * 1. A token we cannot parse is replaced with the Onramp default.
 * 2. An action label that fails against the accent is re-picked as black or white by luminance —
 *    the least destructive fix, and the partner's accent survives.
 * 3. Only if the body pairing itself cannot be rescued do we fall back to safe mode.
 */
export function resolveTheme(theme: ThemeTokens | undefined): ResolvedTheme {
  const input: ThemeTokens = theme ?? {};
  const warnings: string[] = [];
  const tokens: Record<TokenKey, string> = { ...DEFAULT_TOKENS };
  const parsed: Partial<Record<'accent' | 'accentText' | 'surface' | 'text' | 'border', RGBA>> = {};

  for (const key of COLOR_KEYS) {
    const supplied = input[key];
    if (supplied === undefined || supplied === null) {
      parsed[key] = parseColor(DEFAULT_TOKENS[key]) ?? undefined;
      continue;
    }
    const color = parseColor(supplied);
    if (color === null) {
      warnings.push(
        `theme.${key}: could not parse ${JSON.stringify(supplied)}; using the Onramp default. ` +
          'Accepted formats are hex, rgb(), hsl(), oklab(), oklch(), and common named colours.',
      );
      parsed[key] = parseColor(DEFAULT_TOKENS[key]) ?? undefined;
      continue;
    }
    if (color.a < 1) {
      // A translucent token renders against the partner's page, which is outside the shadow root
      // and unknowable from here — so the contrast guard could not honestly certify it. Since the
      // guard is the thing standing between a partner's palette and an illegible disclosure, a
      // token it cannot measure is refused rather than waved through.
      warnings.push(
        `theme.${key}: ${JSON.stringify(supplied)} is not opaque; using the Onramp default. ` +
          'Contrast cannot be verified against a colour that depends on the page behind the card.',
      );
      parsed[key] = parseColor(DEFAULT_TOKENS[key]) ?? undefined;
      continue;
    }
    // Re-serialised rather than echoed — see `toCssColor`.
    tokens[key] = toCssColor(color);
    parsed[key] = color;
  }

  const radius = input.radius;
  if (radius !== undefined && radius !== null) {
    const sanitized = sanitizeRadius(radius);
    if (sanitized === null) {
      warnings.push(
        `theme.radius: ${JSON.stringify(radius)} is not a number of pixels or a px/rem/em length; ` +
          `using ${DEFAULT_TOKENS.radius}.`,
      );
    } else {
      tokens.radius = sanitized;
    }
  }

  // Named for the key the partner actually passed, so the warning points at the line they wrote
  // rather than at the alias they did not use.
  const usedFontAlias = input.fontStack === undefined || input.fontStack === null;
  const fontKey = usedFontAlias ? 'font' : 'fontStack';
  const font = input.fontStack ?? input.font;
  if (font !== undefined && font !== null) {
    const sanitized = sanitizeFont(font);
    if (sanitized === null) {
      warnings.push(
        `theme.${fontKey}: ${JSON.stringify(font)} is not an accepted font stack; using the ` +
          'Onramp default. Use a keyword (system, sans, serif, mono) or a plain family list.',
      );
    } else {
      tokens.fontStack = sanitized;
    }
  }

  // Every parse above falls back to a default we ship, so these are always present.
  const accent = parsed.accent as RGBA;
  const surface = parsed.surface as RGBA;
  const text = parsed.text as RGBA;
  let accentText = parsed.accentText as RGBA;

  const ratios: Record<string, number> = {};
  let safeMode = false;

  // 1. The action label against the accent. Fixed on its own, without touching anything else.
  const accentPair = contrastRatio(accentText, accent);
  ratios['accentText/accent'] = accentPair;
  if (accentPair < CONTRAST.body) {
    const ink = pickReadableInk(accent);
    ratios['accentText/accent:corrected'] = ink.ratio;
    if (ink.ratio >= CONTRAST.body) {
      warnings.push(
        `theme.accentText contrasts ${accentPair.toFixed(2)}:1 against theme.accent, below the ` +
          `${CONTRAST.body}:1 needed. Substituting ${ink.color} on the action.`,
      );
      tokens.accentText = ink.color;
      accentText = parseColor(ink.color) as RGBA;
    } else {
      warnings.push(
        `theme.accent cannot carry a legible label at any ink (best ${ink.ratio.toFixed(2)}:1). ` +
          'Falling back to safe mode.',
      );
      safeMode = true;
    }
  }

  // 2. Body pairings. These are the compliance surface — the disclosure most of all.
  const disclosureFill = mixOklab(text, surface, MIX.disclosureFill);
  const checks: Check[] = [
    { name: 'text/surface', fg: text, bg: surface, min: CONTRAST.body, severity: 'block' },
    {
      name: 'disclosure',
      fg: mixOklab(text, surface, MIX.disclosure),
      bg: disclosureFill,
      min: CONTRAST.body,
      severity: 'block',
    },
    {
      name: 'mechanism',
      fg: mixOklab(text, surface, MIX.mechanism),
      bg: surface,
      min: CONTRAST.body,
      severity: 'block',
    },
    {
      name: 'qualifierBand',
      fg: text,
      bg: mixOklab(accent, surface, MIX.bandFill),
      min: CONTRAST.body,
      severity: 'block',
    },
    {
      name: 'attribution',
      fg: mixOklab(text, surface, MIX.attribution),
      bg: surface,
      min: CONTRAST.body,
      severity: 'warn',
    },
    {
      name: 'departure',
      fg: mixOklab(text, surface, MIX.departure),
      bg: surface,
      min: CONTRAST.body,
      severity: 'warn',
    },
  ];

  for (const check of checks) {
    const ratio = contrastRatio(check.fg, check.bg);
    ratios[check.name] = ratio;
    if (ratio >= check.min) continue;
    if (check.severity === 'block') {
      warnings.push(
        `${check.name} contrasts ${ratio.toFixed(2)}:1, below the ${check.min}:1 needed. ` +
          'Falling back to safe mode.',
      );
      safeMode = true;
    } else {
      warnings.push(`${check.name} contrasts ${ratio.toFixed(2)}:1, below the ${check.min}:1 needed.`);
    }
  }

  if (safeMode) {
    // Neutral everything. The accent survives only as the 3px top rule, and the action is filled
    // with ink — guaranteed legible, and visibly not the partner's brand.
    tokens.text = DEFAULT_TOKENS.text;
    tokens.surface = DEFAULT_TOKENS.surface;
    tokens.border = DEFAULT_TOKENS.border;
    tokens.accentText = DEFAULT_TOKENS.accentText;
  }

  return { tokens, safeMode, warnings, ratios };
}

export function warn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`${LOG_PREFIX} ${message}`);
}
