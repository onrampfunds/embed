import type { Lexicon, ServedCopy } from './types';

/**
 * Regulated strings are served in the prequalification response, not compiled in — a partner
 * pinned to an old version would otherwise show an old disclosure forever.
 *
 * What lives here are the **fallbacks**, used only when a response omits a string. They are still
 * regulated copy and carry the same sign-off as the served versions (CTO-404). Everything else in
 * this file is UI chrome that carries no regulatory weight.
 */

interface LexiconCopy {
  qualifier: string;
  mechanism: string;
  /** Written without the validity sentence; it is appended only when we have a date. */
  disclosure: string;
  expiredDisclosure: string;
}

const FALLBACKS: Record<Lexicon, LexiconCopy> = {
  loan: {
    qualifier:
      'Pre-qualified, not approved. Onramp confirms the amount after reviewing your bank data — ' +
      'it can go up or down.',
    mechanism:
      'Repaid automatically as a share of your daily sales. The fee, the rate, and the expected ' +
      'length are set after review and shown in full before you accept anything.',
    disclosure:
      'Pre-qualification from Onramp Funds is not an offer of credit. All applications are ' +
      'subject to review prior to approval; the amount is derived from sales history alone and ' +
      'may change once bank data is reviewed.',
    expiredDisclosure:
      'Pre-qualification from Onramp Funds is not an offer of credit. This estimate has expired ' +
      'and no amount is shown.',
  },
  mca: {
    // No "repayment", no "term", no "due", no "credit", and the advance is never framed as a debt.
    qualifier:
      'Pre-qualified, not approved. Onramp confirms the amount after reviewing your bank data — ' +
      'it can go up or down.',
    mechanism:
      'Payments come automatically from a share of your daily sales. The cost and the sales ' +
      'share are set after review and shown in full before you accept anything.',
    disclosure:
      'Pre-qualification from Onramp Funds is not an offer of financing. A cash advance is a ' +
      'purchase of future receivables, not a loan. All applications are subject to review prior ' +
      'to approval; the amount is derived from sales history alone and may change.',
    expiredDisclosure:
      'Pre-qualification from Onramp Funds is not an offer of financing. A cash advance is a ' +
      'purchase of future receivables, not a loan. This estimate has expired and no amount is ' +
      'shown.',
  },
};

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

/**
 * A served string is used only if it is a non-empty string. Anything else — missing, null, empty,
 * whitespace, the wrong type — falls back. A card must never render without its disclosure.
 */
function served(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
  /** Which served strings were absent and fell back. Useful to partners debugging their payload. */
  fellBack: string[];
}

export interface CopyInput {
  lexicon: Lexicon;
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
  const bank = FALLBACKS[input.lexicon];
  const supplied = input.copy ?? {};
  const fellBack: string[] = [];

  const take = (key: keyof LexiconCopy, value: unknown): string => {
    const provided = served(value);
    if (provided !== null) return provided;
    fellBack.push(key);
    return bank[key];
  };

  const qualifier = take('qualifier', supplied.qualifier);
  const mechanism = take('mechanism', supplied.mechanism);

  let disclosure: string;
  if (input.expired) {
    disclosure = take('expiredDisclosure', supplied.expiredDisclosure);
    if (served(supplied.expiredDisclosure) === null && input.validUntil !== null) {
      disclosure = disclosure.replace(
        'This estimate has expired',
        `This estimate expired ${input.validUntil}`,
      );
    }
  } else {
    disclosure = take('disclosure', supplied.disclosure);
    // The validity sentence belongs to the fallback only; a served disclosure arrives complete.
    if (served(supplied.disclosure) === null && input.validUntil !== null) {
      disclosure = `${disclosure} Valid until ${input.validUntil}.`;
    }
  }

  const site = input.partnerName ?? 'this site';

  return {
    qualifier,
    mechanism,
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
    fellBack,
  };
}
