import { servedString } from './config';
import type { ServedCopy } from './types';

/**
 * Regulated strings are served in the prequalification response and are **required** — there are
 * no baked fallbacks, deliberately.
 *
 * A fallback is compiled-in regulated copy, which is exactly what serving the strings exists to
 * avoid: frozen at publish time, rendering to merchants, and unrevisable without a release that
 * every partner then has to take. It also converts a missing field into a silent substitution, so
 * a server bug or a payload mangled in transit renders a plausible card instead of failing where
 * someone would notice. A response missing a regulated string is refused in `config.ts`, and the
 * card renders nothing.
 *
 * What lives here is UI chrome, which carries no regulatory weight and can safely ship in the
 * package.
 */

/** UI chrome. No regulatory weight, so it ships in the package and is not served. */
export const CHROME = {
  attribution: 'Onramp Funds',
  eyebrow: 'Pre-qualified for up to',
  ctaLabel: 'See your offer',
  expiredCtaLabel: 'Check current amount on Onramp',
  expiredTitle: 'This estimate is out of date.',
  loadingLabel: 'Loading pre-qualification',
  /** Only used where there is no apply URL to name — the mounting state, which shows no action. */
  defaultApplyHost: 'onrampfunds.com',
} as const;

export interface ResolvedCopy {
  qualifier: string;
  mechanism: string;
  disclosure: string;
  expiredTitle: string;
  expiredReason: string;
  attribution: string;
  eyebrow: string;
  ctaLabel: string;
  loadingLabel: string;
  departure: string;
}

export interface CopyInput {
  copy: ServedCopy | undefined;
  expired: boolean;
  /** Already formatted for the merchant's locale, or `null` when no expiry was supplied. */
  validUntil: string | null;
  /** The partner's name, or `null` — the departure notice reads "this site" without one. */
  partnerName: string | null;
  /**
   * Host of the apply URL, so the departure notice names where the merchant is actually going.
   * Taken from the URL rather than asserted, so the card cannot claim a destination it was not
   * given.
   */
  applyHost: string | null;
}

export function resolveCopy(input: CopyInput): ResolvedCopy {
  const supplied = input.copy ?? {};

  // Presence is guaranteed by `normalize`, which refuses the config otherwise. The empty-string
  // defaults here are unreachable and exist only so this returns a total value rather than
  // asserting non-null — a card is not a place to discover a broken invariant at runtime.
  const disclosure = input.expired
    ? (servedString(supplied.expiredDisclosure) ?? '')
    : (servedString(supplied.disclosure) ?? '');

  const site = input.partnerName ?? 'this site';

  return {
    qualifier: servedString(supplied.qualifier) ?? '',
    mechanism: servedString(supplied.mechanism) ?? '',
    disclosure,
    expiredTitle: CHROME.expiredTitle,
    expiredReason:
      input.validUntil !== null
        ? `It expired ${input.validUntil}. Onramp has the current figure — nothing here is ` +
          'accurate any more.'
        : 'Onramp has the current figure — nothing here is accurate any more.',
    attribution: CHROME.attribution,
    eyebrow: CHROME.eyebrow,
    ctaLabel: input.expired ? CHROME.expiredCtaLabel : CHROME.ctaLabel,
    loadingLabel: CHROME.loadingLabel,
    departure: `Takes you to ${input.applyHost ?? CHROME.defaultApplyHost} — you'll leave ${site}.`,
  };
}
