/**
 * Amount and date formatting through `Intl`, which every browser we support already ships. No
 * formatting library, and nothing that needs a locale bundle.
 */

/**
 * Formats the prequalified amount in major currency units — `40000` renders as `$40,000`.
 *
 * Fractions are dropped deliberately: a prequalified figure is an indicative ceiling, and cents
 * on it would imply a precision that does not exist before bank review.
 */
export function formatAmount(amount: number, currency: string, locale: string | undefined): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // An unknown currency code throws rather than degrading, so fall back to a grouped number.
    try {
      return `${currency} ${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount)}`;
    } catch {
      return `${currency} ${Math.round(amount)}`;
    }
  }
}

