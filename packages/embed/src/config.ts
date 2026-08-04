import type { CardState, Lexicon, MountConfig, ServedCopy, ThemeTokens } from './types';

export interface NormalizedConfig {
  state: Exclude<CardState, 'invalid'>;
  amount: number | null;
  currency: string;
  lexicon: Lexicon;
  applyUrl: string;
  /** Host of {@link applyUrl}, so the departure notice can name where the merchant is going. */
  applyHost: string | null;
  partnerName: string | null;
  locale: string | undefined;
  validUntil: Date | null;
  copy: ServedCopy | undefined;
  theme: ThemeTokens | undefined;
  onEvent: MountConfig['onEvent'];
}

export type NormalizeResult =
  | { ok: true; config: NormalizedConfig }
  | { ok: false; reason: string };

const LEXICONS: readonly string[] = ['loan', 'mca'];
const CURRENCY = /^[A-Za-z]{3}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strips control characters and clips length, so a partner string cannot deform the card. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // Control characters are stripped so a partner string cannot deform the card.
  const stripped = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (stripped.length === 0) return null;
  return stripped.length > max ? `${stripped.slice(0, max - 1).trimEnd()}…` : stripped;
}

/** `URL.hostname` keeps the brackets on an IPv6 host, so `[::1]` is the value to compare. */
function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** Where an apply URL is expected to point. */
const ONRAMP_HOSTS = ['onrampfunds.com'];

/**
 * Whether the apply URL goes where the card says it goes.
 *
 * This is deliberately a warning and not a rejection. The apply URL comes from our own
 * prequalification response, so anything else means the partner's integration is wrong and they
 * should hear about it — but hard-coding our own domain as a validation rule would mean any future
 * Onramp host silently breaks every card in production, which is a worse failure than the one it
 * prevents. The card names the real destination either way, so it cannot misstate where it sends
 * a merchant.
 */
export function isExpectedApplyHost(hostname: string): boolean {
  if (isLoopback(hostname)) return true;
  return ONRAMP_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

/**
 * Only `https:` is accepted, so a prequalification cannot hand a merchant off over plain HTTP and
 * `javascript:` can never reach the anchor. Loopback over HTTP is allowed so a partner can develop
 * against a local Onramp.
 */
function normalizeApplyUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol === 'https:') return url;
  if (url.protocol === 'http:' && isLoopback(url.hostname)) return url;
  return null;
}

/**
 * Turns whatever the partner passed into something the renderer can trust, or explains why it
 * cannot. A malformed config renders nothing at all — never a broken card in production.
 */
export function normalize(raw: unknown, now: Date): NormalizeResult {
  if (!isObject(raw)) {
    return { ok: false, reason: 'config must be an object' };
  }

  const config = raw as MountConfig;
  const onEvent = typeof config.onEvent === 'function' ? config.onEvent : undefined;
  const locale = typeof config.locale === 'string' && config.locale.trim().length > 0
    ? config.locale.trim()
    : undefined;
  const partnerName = cleanText(config.partnerName, 48);
  const theme = isObject(config.theme) ? (config.theme as ThemeTokens) : undefined;
  const copy = isObject(config.copy) ? (config.copy as ServedCopy) : undefined;

  let lexicon: Lexicon = 'loan';
  if (config.lexicon !== undefined && config.lexicon !== null) {
    if (typeof config.lexicon !== 'string' || !LEXICONS.includes(config.lexicon)) {
      // Guessing here would show an MCA merchant loan vocabulary, which is non-compliant.
      return { ok: false, reason: `lexicon must be 'loan' or 'mca', got ${JSON.stringify(config.lexicon)}` };
    }
    lexicon = config.lexicon;
  }

  let validUntil: Date | null = null;
  if (config.validUntil !== undefined && config.validUntil !== null) {
    if (typeof config.validUntil !== 'string') {
      return { ok: false, reason: 'validUntil must be an ISO 8601 string' };
    }
    const parsed = new Date(config.validUntil);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, reason: `validUntil is not a valid date: ${JSON.stringify(config.validUntil)}` };
    }
    validUntil = parsed;
  }

  const base = {
    currency: 'USD',
    lexicon,
    partnerName,
    locale,
    validUntil,
    copy,
    theme,
    onEvent,
  };

  // Refused rather than treated as 'auto', for the same reason as `lexicon`: a typo like
  // 'mounting ' would otherwise fall through and surface as a confusing complaint about a missing
  // applyUrl, several steps from the actual mistake.
  if (config.state !== undefined && config.state !== null) {
    if (config.state !== 'auto' && config.state !== 'mounting') {
      return { ok: false, reason: `state must be 'auto' or 'mounting', got ${JSON.stringify(config.state)}` };
    }
  }

  // The partner is still fetching. No amount is expected yet, so nothing else is required.
  if (config.state === 'mounting') {
    return { ok: true, config: { ...base, state: 'mounting', amount: null, applyUrl: '', applyHost: null } };
  }

  // No amount is not an error and never reads as a rejection — we yield the slot and say nothing.
  if (config.amount === undefined || config.amount === null || config.amount === 0) {
    return { ok: true, config: { ...base, state: 'none', amount: null, applyUrl: '', applyHost: null } };
  }

  if (typeof config.amount !== 'number' || !Number.isFinite(config.amount) || config.amount < 0) {
    return { ok: false, reason: `amount must be a positive number, got ${JSON.stringify(config.amount)}` };
  }

  let currency = 'USD';
  if (config.currency !== undefined && config.currency !== null) {
    if (typeof config.currency !== 'string' || !CURRENCY.test(config.currency)) {
      return { ok: false, reason: `currency must be a 3-letter ISO 4217 code, got ${JSON.stringify(config.currency)}` };
    }
    currency = config.currency.toUpperCase();
  }

  const applyUrl = normalizeApplyUrl(config.applyUrl);
  if (applyUrl === null) {
    return {
      ok: false,
      reason: 'applyUrl must be an absolute https: URL (or http: on loopback, for local development)',
    };
  }

  const expired = validUntil !== null && validUntil.getTime() <= now.getTime();

  return {
    ok: true,
    config: {
      ...base,
      currency,
      applyUrl: applyUrl.href,
      applyHost: applyUrl.hostname,
      state: expired ? 'expired' : 'prequalified',
      // An expired card must not carry the figure anywhere, including in the DOM.
      amount: expired ? null : config.amount,
    },
  };
}
