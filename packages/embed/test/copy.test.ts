import { describe, expect, it } from 'vitest';
import { resolveCopy } from '../src/copy';

const input = (overrides: Partial<Parameters<typeof resolveCopy>[0]> = {}) =>
  resolveCopy({
    lexicon: 'loan',
    copy: undefined,
    expired: false,
    validUntil: 'Aug 14, 2026',
    partnerName: null,
    applyHost: 'onrampfunds.com',
    ...overrides,
  });

describe('resolveCopy', () => {
  it('prefers the served string when there is one', () => {
    const copy = input({
      copy: {
        disclosure: 'Served disclosure, revised by compliance.',
        mechanism: 'Served mechanism.',
        qualifier: 'Served qualifier.',
      },
    });
    expect(copy.disclosure).toBe('Served disclosure, revised by compliance.');
    expect(copy.mechanism).toBe('Served mechanism.');
    expect(copy.qualifier).toBe('Served qualifier.');
    expect(copy.fellBack).toEqual([]);
  });

  it('does not append a validity sentence to a served disclosure, which arrives complete', () => {
    const copy = input({ copy: { disclosure: 'Served disclosure.' } });
    expect(copy.disclosure).toBe('Served disclosure.');
  });

  describe('failing closed', () => {
    it.each([
      ['missing', undefined],
      ['null', null],
      ['empty', ''],
      ['whitespace', '   '],
      ['the wrong type', 42],
    ])('falls back when the served disclosure is %s', (_label, value) => {
      const copy = input({ copy: { disclosure: value as string } });
      expect(copy.disclosure.length).toBeGreaterThan(0);
      expect(copy.disclosure).toContain('subject to review prior to approval');
      expect(copy.fellBack).toContain('disclosure');
    });

    it('never produces an empty disclosure for any state or lexicon', () => {
      for (const lexicon of ['loan', 'mca'] as const) {
        for (const expired of [false, true]) {
          for (const validUntil of ['Aug 14, 2026', null]) {
            const copy = resolveCopy({
              lexicon,
              copy: { disclosure: '', expiredDisclosure: '  ' },
              expired,
              validUntil,
              partnerName: null,
              applyHost: 'onrampfunds.com',
            });
            expect(copy.disclosure.trim().length, `${lexicon}/${expired}/${validUntil}`)
              .toBeGreaterThan(20);
          }
        }
      }
    });
  });

  describe('the validity date', () => {
    it('is appended to the baked disclosure when we have one', () => {
      expect(input().disclosure).toContain('Valid until Aug 14, 2026.');
    });

    it('is left out entirely when there is no expiry, rather than dangling', () => {
      const copy = input({ validUntil: null });
      expect(copy.disclosure).not.toContain('Valid until');
      expect(copy.disclosure.trim().endsWith('.')).toBe(true);
    });

    it('names the expiry in the expired disclosure', () => {
      const copy = input({ expired: true });
      expect(copy.disclosure).toContain('expired Aug 14, 2026');
      expect(copy.disclosure).toContain('no amount is shown');
    });
  });

  describe('the two lexicons', () => {
    it('uses loan vocabulary for a loan', () => {
      const copy = input({ lexicon: 'loan' });
      expect(copy.mechanism).toContain('Repaid');
      expect(copy.disclosure).toContain('not an offer of credit');
    });

    it('keeps debt vocabulary out of the asset-purchase mechanism line', () => {
      const copy = input({ lexicon: 'mca' });
      const forbidden = ['repaid', 'repayment', 'term', 'due', 'credit', 'borrow', 'debt'];
      for (const word of forbidden) {
        expect(copy.mechanism.toLowerCase(), `mechanism contains "${word}"`).not.toContain(word);
        expect(copy.qualifier.toLowerCase(), `qualifier contains "${word}"`).not.toContain(word);
      }
    });

    it('states in the asset-purchase disclosure that it is not a loan', () => {
      const copy = input({ lexicon: 'mca' });
      expect(copy.disclosure).toContain('purchase of future receivables, not a loan');
      expect(copy.disclosure).not.toContain('offer of credit');
    });

    it('carries the receivables framing into the expired disclosure too', () => {
      const copy = input({ lexicon: 'mca', expired: true });
      expect(copy.disclosure).toContain('purchase of future receivables, not a loan');
    });
  });

  describe('chrome', () => {
    it('never says "approved" next to the amount, and always says "up to"', () => {
      const copy = input();
      expect(copy.eyebrow).toBe('Pre-qualified for up to');
      expect(copy.qualifier.toLowerCase()).toContain('not approved');
    });

    it('names the partner in the departure notice when it knows one', () => {
      expect(input({ partnerName: 'Cartwheel' }).departure).toBe(
        "Takes you to onrampfunds.com — you'll leave Cartwheel.",
      );
      expect(input().departure).toBe("Takes you to onrampfunds.com — you'll leave this site.");
    });

    it('switches the action label in the expired state', () => {
      expect(input().ctaLabel).toBe('See your offer');
      expect(input({ expired: true }).ctaLabel).toBe('Check current amount on Onramp');
    });

    it('names the destination it was actually given, never one it assumed', () => {
      // The card carries Onramp's attribution row. It must not be able to claim a merchant is
      // going to onrampfunds.com while the link points somewhere else.
      expect(input({ applyHost: 'apply.onrampfunds.com' }).departure).toBe(
        "Takes you to apply.onrampfunds.com — you'll leave this site.",
      );
      expect(input({ applyHost: 'somewhere-else.example' }).departure).toBe(
        "Takes you to somewhere-else.example — you'll leave this site.",
      );
    });
  });
});
