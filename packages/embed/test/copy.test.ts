import { describe, expect, it } from 'vitest';
import { CHROME, resolveCopy } from '../src/copy';

const SERVED = {
  qualifier: 'Pre-qualified, not approved. Onramp confirms the amount after bank review.',
  mechanism: 'Repaid automatically as a share of your daily sales.',
  disclosure: 'Not an offer of credit. All applications are subject to review prior to approval.',
};

const input = (overrides: Partial<Parameters<typeof resolveCopy>[0]> = {}) =>
  resolveCopy({
    copy: SERVED,
    partnerName: null,
    applyHost: 'onrampfunds.com',
    ...overrides,
  });

describe('resolveCopy', () => {
  describe('the served strings', () => {
    it('renders them verbatim, with nothing appended', () => {
      // A served disclosure arrives complete. Appending a validity sentence here would mean the
      // package editing regulated copy after compliance signed it off.
      const copy = input();
      expect(copy.qualifier).toBe(SERVED.qualifier);
      expect(copy.mechanism).toBe(SERVED.mechanism);
      expect(copy.disclosure).toBe(SERVED.disclosure);
    });

    it('ships no compiled-in regulated copy to fall back on', async () => {
      // The point of the change: there is no bank of strings in this module to substitute. If one
      // reappears, a merchant can be shown copy compliance cannot revise without a release.
      const { readFileSync } = await import('node:fs');
      const source = readFileSync('src/copy.ts', 'utf8');
      for (const phrase of [
        'not an offer of credit',
        'not an offer of financing',
        'purchase of future receivables',
        'subject to review prior to approval',
        'pre-qualified, not approved',
      ]) {
        expect(source.toLowerCase(), `copy.ts contains regulated phrase "${phrase}"`)
          .not.toContain(phrase);
      }
    });
  });

  describe('chrome, which carries no regulatory weight', () => {
    it('never says "approved" next to the amount, and always says "up to"', () => {
      expect(input().eyebrow).toBe('Pre-qualified for up to');
      expect(CHROME.eyebrow).toContain('up to');
      expect(CHROME.eyebrow.toLowerCase()).not.toContain('approved for');
    });

    it('labels the action as seeing the offer', () => {
      expect(input().ctaLabel).toBe('See your offer');
    });

    it('names the partner in the departure notice when it knows one', () => {
      expect(input({ partnerName: 'Cartwheel' }).departure).toBe(
        "Takes you to onrampfunds.com — you'll leave Cartwheel.",
      );
      expect(input().departure).toBe("Takes you to onrampfunds.com — you'll leave this site.");
    });

    it('names the destination it was actually given, never one it assumed', () => {
      // The card carries Onramp's attribution row. It must not be able to claim a merchant is
      // going to onrampfunds.com while the link points somewhere else.
      expect(input({ applyHost: 'apply.onrampfunds.com' }).departure).toContain(
        'Takes you to apply.onrampfunds.com',
      );
      expect(input({ applyHost: 'somewhere-else.example' }).departure).toContain(
        'Takes you to somewhere-else.example',
      );
    });
  });
});
