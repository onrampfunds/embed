import { describe, expect, it } from 'vitest';
import { normalize } from '../src/config';

const COPY = {
  qualifier: 'Pre-qualified, not approved.',
  mechanism: 'Repaid as a share of your daily sales.',
  disclosure: 'Not an offer of credit. Subject to review prior to approval.',
};

const base = {
  amount: 40000,
  currency: 'USD',
  applyUrl: 'https://onrampfunds.com/p/abc123',
  lexicon: 'loan' as const,
  copy: COPY,
};

const ok = (raw: unknown) => {
  const result = normalize(raw);
  if (!result.ok) throw new Error(`expected a valid config, got: ${result.reason}`);
  return result.config;
};

const rejected = (raw: unknown): string => {
  const result = normalize(raw);
  if (result.ok) throw new Error(`expected a rejection, got state ${result.config.state}`);
  return result.reason;
};

describe('normalize', () => {
  it('accepts the ticket integration snippet', () => {
    const config = ok({
      amount: 40000,
      currency: 'USD',
      applyUrl: 'https://onrampfunds.com/p/abc123',
      lexicon: 'loan',
      // The ticket's snippet writes this as `copy: { /* served strings */ }`. The strings are
      // required, so the snippet works with them supplied — which is what a partner forwards.
      copy: COPY,
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

  describe('the mounting state', () => {
    it('needs no amount or applyUrl, because the partner is still fetching', () => {
      const config = ok({ state: 'mounting' });
      expect(config.state).toBe('mounting');
      expect(config.amount).toBeNull();
    });

    it('treats an explicit auto as the ordinary path', () => {
      expect(ok({ ...base, state: 'auto' }).state).toBe('prequalified');
    });

    it('refuses an unrecognised state rather than silently treating it as auto', () => {
      // 'mounting ' falling through to auto would surface as a confusing complaint about a
      // missing applyUrl, several steps away from the actual typo.
      expect(rejected({ state: 'mounting ' })).toContain('state');
      expect(rejected({ ...base, state: 'loading' })).toContain('state');
      expect(rejected({ ...base, state: 1 })).toContain('state');
    });
  });

  describe('malformed config', () => {
    it('rejects a config that is not an object', () => {
      expect(rejected(null)).toContain('object');
      expect(rejected('nope')).toContain('object');
      expect(rejected([])).toContain('object');
      expect(rejected(undefined)).toContain('object');
    });

    it.each([
      ['a Date', new Date()],
      ['a Map', new Map()],
      ['an Error', new Error('nope')],
      ['a RegExp', /nope/],
      ['a Promise', Promise.resolve()],
      ['a function', () => undefined],
    ])('rejects %s rather than treating it as an empty config', (_label, value) => {
      // These have no `amount`, so a looser check would normalise them to `none` and render
      // nothing silently. A missing amount is legitimate; a Date where a config goes is a bug.
      expect(rejected(value)).toContain('object');
    });

    it.each([
      ['a plain object', { amount: 40000 }],
      ['a null-prototype object', Object.assign(Object.create(null), { amount: 40000 })],
      ['a class instance', new (class Config { amount = 40000; })()],
    ])('still accepts %s carrying the right fields', (_label, value) => {
      // Deliberately not a prototype comparison: config arriving from another realm, from a
      // null-prototype object, or from a class instance is all legitimate.
      const result = normalize({ ...base, ...value });
      expect(result.ok).toBe(true);
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

    it('rejects a bad currency code', () => {
      expect(rejected({ ...base, currency: 'DOLLARS' })).toContain('currency');
      expect(rejected({ ...base, currency: 12 })).toContain('currency');
    });

    describe('applyUrl', () => {
      it('is required whenever there is a figure to act on', () => {
        expect(rejected({ amount: 40000 })).toContain('applyUrl');
      });

      it('must be absolute https anywhere other than loopback', () => {
        expect(rejected({ ...base, applyUrl: '/apply' })).toContain('applyUrl');
        expect(rejected({ ...base, applyUrl: 'http://onrampfunds.com/p/a' })).toContain('applyUrl');
      });

      it('refuses a javascript: URL', () => {
        expect(rejected({ ...base, applyUrl: 'javascript:alert(1)' })).toContain('applyUrl');
        expect(rejected({ ...base, applyUrl: 'data:text/html,<script>' })).toContain('applyUrl');
      });

      it('allows http on loopback so a partner can develop locally', () => {
        // `URL.hostname` keeps the brackets on an IPv6 host, so `[::1]` is the value to compare.
        for (const host of ['localhost:3000', '127.0.0.1', '[::1]:3000']) {
          expect(ok({ ...base, applyUrl: `http://${host}/p/a` }).state, host).toBe('prequalified');
        }
      });

      it('refuses credentials in the URL', () => {
        // `https://onrampfunds.com@evil.example/p/a` has a real host of evil.example and wears
        // our name as userinfo. The departure notice would name the true host, but the link
        // would still carry a brand-shaped disguise into the address bar.
        expect(rejected({ ...base, applyUrl: 'https://onrampfunds.com@evil.example/p/a' }))
          .toContain('applyUrl');
        expect(rejected({ ...base, applyUrl: 'https://user:pass@onrampfunds.com/p/a' }))
          .toContain('applyUrl');
        expect(rejected({ ...base, applyUrl: 'https://user@onrampfunds.com/p/a' }))
          .toContain('applyUrl');
      });

      it('does not mistake a hostname that merely contains a loopback name', () => {
        expect(rejected({ ...base, applyUrl: 'http://localhost.evil.com/p/a' })).toContain('applyUrl');
        expect(rejected({ ...base, applyUrl: 'http://127.0.0.1.evil.com/p/a' })).toContain('applyUrl');
      });
    });
  });

  describe('the regulated copy is required, not defaulted', () => {
    it.each(['qualifier', 'mechanism', 'disclosure'])(
      'refuses a prequalified card missing copy.%s',
      (key) => {
        const copy = { ...COPY, [key]: undefined };
        expect(rejected({ ...base, copy })).toContain(`copy.${key}`);
      },
    );

    it.each([
      ['empty', ''],
      ['whitespace', '   '],
      ['null', null],
      ['the wrong type', 42],
    ])('refuses a disclosure that is %s', (_label, value) => {
      expect(rejected({ ...base, copy: { ...COPY, disclosure: value } })).toContain('copy.disclosure');
    });

    it('refuses a card with no copy block at all', () => {
      const { copy: _dropped, ...withoutCopy } = base;
      expect(rejected(withoutCopy)).toContain('copy.');
    });

    it('names every missing string at once, not just the first', () => {
      const reason = rejected({ ...base, copy: {} });
      for (const key of ['qualifier', 'mechanism', 'disclosure']) {
        expect(reason).toContain(`copy.${key}`);
      }
    });

    it('requires no copy for the states that render none', () => {
      expect(ok({ state: 'mounting' }).state).toBe('mounting');
      expect(ok({ amount: null }).state).toBe('none');
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

    it.each([
      ['RLO', '\u202e'],
      ['LRO', '\u202d'],
      ['RLE', '\u202b'],
      ['PDF', '\u202c'],
      ['RLI', '\u2067'],
      ['FSI', '\u2068'],
      ['PDI', '\u2069'],
      ['RLM', '\u200f'],
      ['ALM', '\u061c'],
      ['zero-width space', '\u200b'],
      ['BOM', '\ufeff'],
    ])('strips the %s bidi/zero-width control', (_label, control) => {
      // partnerName lands in "you'll leave {name}", which is one of the card's honesty
      // guarantees. These characters reorder the text around them while rendering as nothing,
      // so they can rewrite that sentence without injecting any markup.
      const name = ok({ ...base, partnerName: `Cart${control}wheel` }).partnerName;
      expect(name).toBe('Cartwheel');
      expect(name).not.toContain(control);
    });

    it('leaves legitimate non-Latin names alone', () => {
      // The point is to strip invisible reordering controls, not to mangle real names.
      for (const name of ['Ünïcode Cø', '\u0645\u062a\u062c\u0631', '\u30b9\u30c8\u30a2']) {
        expect(ok({ ...base, partnerName: name }).partnerName).toBe(name);
      }
    });
  });
});
