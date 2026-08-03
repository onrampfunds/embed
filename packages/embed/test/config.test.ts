import { describe, expect, it } from 'vitest';
import { normalize } from '../src/config';

const NOW = new Date('2026-08-03T00:00:00Z');

const base = {
  amount: 40000,
  currency: 'USD',
  applyUrl: 'https://onrampfunds.com/p/abc123',
  lexicon: 'loan' as const,
};

const ok = (raw: unknown) => {
  const result = normalize(raw, NOW);
  if (!result.ok) throw new Error(`expected a valid config, got: ${result.reason}`);
  return result.config;
};

const rejected = (raw: unknown): string => {
  const result = normalize(raw, NOW);
  if (result.ok) throw new Error(`expected a rejection, got state ${result.config.state}`);
  return result.reason;
};

describe('normalize', () => {
  it('accepts the ticket integration snippet', () => {
    const config = ok({
      amount: 40000,
      currency: 'USD',
      validUntil: '2026-08-06T07:00:00Z',
      applyUrl: 'https://onrampfunds.com/p/abc123',
      lexicon: 'loan',
      copy: {},
      theme: { accent: '#5B21B6', radius: 8, font: 'system' },
      onEvent: () => undefined,
    });
    expect(config.state).toBe('prequalified');
    expect(config.amount).toBe(40000);
    expect(config.currency).toBe('USD');
    expect(typeof config.onEvent).toBe('function');
  });

  describe('the none state', () => {
    it('is chosen for a missing, null, or zero amount, and is never an error', () => {
      expect(ok({}).state).toBe('none');
      expect(ok({ amount: null }).state).toBe('none');
      expect(ok({ amount: 0 }).state).toBe('none');
    });

    it('does not require an applyUrl, so the partner is not forced to invent one', () => {
      expect(ok({ amount: null }).state).toBe('none');
    });
  });

  describe('the expired state', () => {
    it('is chosen once validUntil has passed', () => {
      const config = ok({ ...base, validUntil: '2026-08-01T00:00:00Z' });
      expect(config.state).toBe('expired');
    });

    it('strips the amount, so a stale figure cannot reach the DOM at all', () => {
      const config = ok({ ...base, validUntil: '2026-08-01T00:00:00Z' });
      expect(config.amount).toBeNull();
    });

    it('treats the exact expiry instant as expired', () => {
      expect(ok({ ...base, validUntil: NOW.toISOString() }).state).toBe('expired');
    });

    it('stays prequalified while the expiry is in the future', () => {
      expect(ok({ ...base, validUntil: '2026-08-06T07:00:00Z' }).state).toBe('prequalified');
    });
  });

  describe('the mounting state', () => {
    it('needs no amount or applyUrl, because the partner is still fetching', () => {
      const config = ok({ state: 'mounting' });
      expect(config.state).toBe('mounting');
      expect(config.amount).toBeNull();
    });
  });

  describe('malformed config', () => {
    it('rejects a config that is not an object', () => {
      expect(rejected(null)).toContain('object');
      expect(rejected('nope')).toContain('object');
      expect(rejected([])).toContain('object');
    });

    it('refuses an unrecognised lexicon rather than guessing', () => {
      // Guessing would show an asset-purchase merchant loan vocabulary, which is non-compliant.
      expect(rejected({ ...base, lexicon: 'mca ' })).toContain('lexicon');
      expect(rejected({ ...base, lexicon: 'advance' })).toContain('lexicon');
      expect(rejected({ ...base, lexicon: 1 })).toContain('lexicon');
    });

    it('rejects a non-numeric or negative amount', () => {
      expect(rejected({ ...base, amount: '40000' })).toContain('amount');
      expect(rejected({ ...base, amount: -1 })).toContain('amount');
      expect(rejected({ ...base, amount: Number.NaN })).toContain('amount');
      expect(rejected({ ...base, amount: Number.POSITIVE_INFINITY })).toContain('amount');
    });

    it('rejects an unparseable expiry instead of silently showing a live card', () => {
      expect(rejected({ ...base, validUntil: 'next tuesday' })).toContain('validUntil');
      expect(rejected({ ...base, validUntil: 12345 })).toContain('validUntil');
    });

    it('rejects a bad currency code', () => {
      expect(rejected({ ...base, currency: 'DOLLARS' })).toContain('currency');
      expect(rejected({ ...base, currency: 12 })).toContain('currency');
    });

    describe('applyUrl', () => {
      it('is required whenever there is a figure to act on', () => {
        expect(rejected({ amount: 40000 })).toContain('applyUrl');
      });

      it('must be absolute https', () => {
        expect(rejected({ ...base, applyUrl: '/apply' })).toContain('applyUrl');
        expect(rejected({ ...base, applyUrl: 'http://onrampfunds.com/p/a' })).toContain('applyUrl');
      });

      it('refuses a javascript: URL', () => {
        expect(rejected({ ...base, applyUrl: 'javascript:alert(1)' })).toContain('applyUrl');
        expect(rejected({ ...base, applyUrl: 'data:text/html,<script>' })).toContain('applyUrl');
      });

      it('allows http on loopback so a partner can develop locally', () => {
        expect(ok({ ...base, applyUrl: 'http://localhost:3000/p/a' }).state).toBe('prequalified');
      });
    });
  });

  describe('partnerName', () => {
    it('is trimmed, collapsed, and clipped', () => {
      expect(ok({ ...base, partnerName: '  Cartwheel  ' }).partnerName).toBe('Cartwheel');
      expect(ok({ ...base, partnerName: 'A'.repeat(200) }).partnerName?.length).toBe(48);
      expect(ok({ ...base, partnerName: '   ' }).partnerName).toBeNull();
      expect(ok({ ...base, partnerName: 42 }).partnerName).toBeNull();
    });

    it('strips control characters so it cannot deform the card', () => {
      const name = ok({ ...base, partnerName: 'Car\u0007twheel\nInc' }).partnerName;
      expect(name).toBe('Car twheel Inc');
    });
  });
});
