import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, version } from '../src/index';
import { REGION_LABEL } from '../src/constants';
import {
  captureShadowRoots,
  clickCta,
  makeContainer,
  silenceConsole,
  trapNetwork,
  validConfig,
} from './helpers';

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

let container: HTMLElement;
let shadow: ReturnType<typeof captureShadowRoots>;

beforeEach(() => {
  document.body.replaceChildren();
  container = makeContainer();
  shadow = captureShadowRoots();
});

afterEach(() => {
  shadow.restore();
  vi.restoreAllMocks();
});

const root = (): ShadowRoot => {
  const last = shadow.roots[shadow.roots.length - 1];
  if (last === undefined) throw new Error('nothing was mounted');
  return last;
};

const card = (): HTMLElement => {
  const found = root().querySelector('.card');
  if (found === null) throw new Error('no .card in the shadow root');
  return found as HTMLElement;
};

const textOf = (selector: string): string =>
  (root().querySelector(selector)?.textContent ?? '').trim();

describe('mount', () => {
  it('exports a version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  describe('the prequalified card', () => {
    beforeEach(() => {
      mount('#capital', validConfig({ partnerName: 'Cartwheel' }));
    });

    it('renders into a closed shadow root', () => {
      expect(shadow.modes).toEqual(['closed']);
    });

    it('is a labelled region that makes sense read alone', () => {
      expect(card().getAttribute('role')).toBe('region');
      expect(card().getAttribute('aria-label')).toBe(REGION_LABEL);
    });

    it('shows the amount, formatted', () => {
      expect(textOf('.amount__figure')).toBe('$40,000');
    });

    it('carries the qualifier directly under the figure, as its own block', () => {
      expect(textOf('.amount__eyebrow')).toBe('Pre-qualified for up to');
      expect(textOf('.amount__band').toLowerCase()).toContain('not approved');
    });

    it('keeps the amount and its qualifier as one reading unit', () => {
      // Nothing focusable may come between them.
      const between = root().querySelectorAll(`.amount ${FOCUSABLE}`);
      expect(between).toHaveLength(0);
    });

    it('has exactly one focusable element', () => {
      const focusable = root().querySelectorAll(FOCUSABLE);
      expect(focusable).toHaveLength(1);
      expect(focusable[0]?.tagName).toBe('A');
    });

    it('points the action at the apply URL, in the same tab', () => {
      const cta = root().querySelector('a.cta') as HTMLAnchorElement;
      expect(cta.getAttribute('href')).toBe('https://onrampfunds.com/p/abc123');
      expect(cta.hasAttribute('target')).toBe(false);
      expect(textOf('.cta')).toBe('See your offer');
    });

    it('states that the merchant is leaving, and names the partner', () => {
      expect(textOf('.departure')).toBe("Takes you to onrampfunds.com — you'll leave Cartwheel.");
    });

    it('renders the mechanism line without any fee, rate, or term figure', () => {
      const mechanism = textOf('.mechanism__text');
      expect(mechanism.length).toBeGreaterThan(0);
      expect(mechanism).not.toMatch(/\d+\s*%/);
      expect(mechanism).not.toMatch(/\$\d/);
    });

    it('always renders a disclosure', () => {
      expect(textOf('.disclosure')).toContain('subject to review prior to approval');
    });

    it('attributes the card to Onramp Funds', () => {
      expect(textOf('.attribution')).toContain('Onramp Funds');
      expect(textOf('.attribution')).toContain('for Cartwheel');
    });
  });

  describe('the expired state', () => {
    beforeEach(() => {
      mount('#capital', validConfig({ validUntil: '2020-01-01T00:00:00Z' }));
    });

    it('removes the amount from the DOM rather than dimming it', () => {
      const html = root().innerHTML;
      expect(html).not.toContain('40,000');
      expect(html).not.toContain('40000');
      expect(root().querySelector('.amount__figure')).toBeNull();
    });

    it('removes the mechanism line with it, since a stale rate is the same problem', () => {
      expect(root().querySelector('.mechanism')).toBeNull();
    });

    it('says plainly that the estimate is out of date', () => {
      expect(textOf('.expired__title')).toBe('This estimate is out of date.');
    });

    it('still offers a way to the current figure', () => {
      expect(textOf('.cta')).toBe('Check current amount on Onramp');
      expect(root().querySelectorAll(FOCUSABLE)).toHaveLength(1);
    });

    it('carries an expiry-specific disclosure', () => {
      expect(textOf('.disclosure')).toContain('no amount is shown');
    });
  });

  describe('the none state', () => {
    it('renders nothing at all and yields the slot', () => {
      const handle = mount('#capital', validConfig({ amount: null }));
      expect(handle).toBeNull();
      expect(container.children).toHaveLength(0);
      expect(shadow.roots).toHaveLength(0);
    });

    it('never reads as a rejection', () => {
      mount('#capital', validConfig({ amount: null }));
      expect(container.textContent).toBe('');
    });
  });

  describe('malformed config', () => {
    it('renders nothing and logs, rather than showing a broken card', () => {
      const console = silenceConsole();
      const handle = mount('#capital', validConfig({ lexicon: 'advance' as never }));
      expect(handle).toBeNull();
      expect(container.children).toHaveLength(0);
      expect(console.errors.join(' ')).toContain('lexicon');
    });

    it('reports a missing mount target without throwing', () => {
      const console = silenceConsole();
      expect(mount('#nowhere', validConfig())).toBeNull();
      expect(console.errors.join(' ')).toContain('did not match an element');
    });

    it('survives a config that is not an object', () => {
      silenceConsole();
      expect(mount('#capital', null as never)).toBeNull();
    });
  });

  describe('the mounting state', () => {
    beforeEach(() => {
      mount('#capital', { state: 'mounting' });
    });

    it('shows static blocks, announced as busy, with no spinner', () => {
      expect(root().querySelector('.skeleton')?.getAttribute('aria-busy')).toBe('true');
      expect(root().querySelectorAll('.skeleton__block')).toHaveLength(4);
    });

    it('has a single hidden label and no focusable element', () => {
      expect(textOf('.sr-only')).toBe('Loading pre-qualification');
      expect(root().querySelectorAll(FOCUSABLE)).toHaveLength(0);
    });
  });

  describe('served copy', () => {
    it('renders the served strings when the response carries them', () => {
      mount(
        '#capital',
        validConfig({
          copy: {
            disclosure: 'Revised disclosure from compliance.',
            mechanism: 'Revised mechanism.',
            qualifier: 'Revised qualifier.',
          },
        }),
      );
      expect(textOf('.disclosure')).toBe('Revised disclosure from compliance.');
      expect(textOf('.mechanism__text')).toBe('Revised mechanism.');
      expect(textOf('.amount__band')).toBe('Revised qualifier.');
    });

    it('renders the baked fallback when a served string is missing', () => {
      mount('#capital', validConfig({ copy: { disclosure: '', mechanism: undefined } }));
      expect(textOf('.disclosure')).toContain('subject to review prior to approval');
      expect(textOf('.mechanism__text').length).toBeGreaterThan(0);
    });

    it('escapes rather than parses copy, so served strings cannot inject markup', () => {
      mount('#capital', validConfig({ copy: { disclosure: '<img src=x onerror=alert(1)>' } }));
      expect(root().querySelector('.disclosure img')).toBeNull();
      expect(textOf('.disclosure')).toBe('<img src=x onerror=alert(1)>');
    });
  });

  describe('the contrast guard', () => {
    it('leaves a good token set alone', () => {
      mount('#capital', validConfig({ theme: { accent: '#2b5ce6', accentText: '#ffffff' } }));
      expect(card().classList.contains('card--safe')).toBe(false);
      expect(root().querySelector('.rule')).toBeNull();
    });

    it('falls back to safe mode and warns when the body pairing cannot be rescued', () => {
      const console = silenceConsole();
      mount('#capital', validConfig({ theme: { text: '#9aa0a6' } }));
      expect(card().classList.contains('card--safe')).toBe(true);
      expect(root().querySelector('.rule')).not.toBeNull();
      expect(console.warns.join(' ')).toContain('safe mode');
    });
  });

  describe('events', () => {
    it('reports a view with the figure it rendered', () => {
      const onEvent = vi.fn();
      mount('#capital', validConfig({ onEvent }));
      expect(onEvent).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({ amount: 40000, currency: 'USD', lexicon: 'loan' }),
      );
    });

    it('reports a skip rather than staying silent when there is no amount', () => {
      const onEvent = vi.fn();
      mount('#capital', validConfig({ amount: null, onEvent }));
      expect(onEvent).toHaveBeenCalledWith('skip', { reason: 'no-amount' });
    });

    it('reports expired and error states', () => {
      silenceConsole();
      const expired = vi.fn();
      mount('#capital', validConfig({ validUntil: '2020-01-01T00:00:00Z', onEvent: expired }));
      expect(expired).toHaveBeenCalledWith('expired', expect.objectContaining({ lexicon: 'loan' }));

      const invalid = vi.fn();
      mount('#capital', validConfig({ amount: -5, onEvent: invalid }));
      expect(invalid).toHaveBeenCalledWith('error', expect.objectContaining({ reason: expect.any(String) }));
    });

    it('reports a click without preventing the navigation', () => {
      const onEvent = vi.fn();
      mount('#capital', validConfig({ onEvent }));
      const clicked = clickCta(root());
      expect(onEvent).toHaveBeenCalledWith(
        'click',
        expect.objectContaining({ applyUrl: clicked.href }),
      );
      expect(clicked.preventedByLibrary).toBe(false);
    });

    it('is not taken down by a handler that throws', () => {
      const console = silenceConsole();
      const onEvent = vi.fn(() => {
        throw new Error('partner analytics exploded');
      });
      expect(() => mount('#capital', validConfig({ onEvent }))).not.toThrow();
      expect(textOf('.amount__figure')).toBe('$40,000');
      expect(console.warns.join(' ')).toContain('onEvent');
    });
  });

  describe('lifecycle', () => {
    it('reports the state it settled on', () => {
      expect(mount('#capital', validConfig())?.state).toBe('prequalified');
      expect(mount('#capital', validConfig({ state: 'mounting' }))?.state).toBe('mounting');
    });

    it('removes the card on unmount, leaving the partner element as it found it', () => {
      const handle = mount('#capital', validConfig());
      expect(container.children).toHaveLength(1);
      handle?.unmount();
      expect(container.children).toHaveLength(0);
      expect(handle?.state).toBe('none');
    });

    it('tolerates unmount being called twice', () => {
      const handle = mount('#capital', validConfig());
      handle?.unmount();
      expect(() => handle?.unmount()).not.toThrow();
    });

    it('replaces rather than stacks when mounted twice', () => {
      mount('#capital', validConfig());
      mount('#capital', validConfig());
      expect(container.children).toHaveLength(1);
    });

    it('re-renders in place on update', () => {
      const handle = mount('#capital', validConfig());
      expect(textOf('.amount__figure')).toBe('$40,000');
      const next = handle?.update(validConfig({ amount: 12500 }));
      expect(next).toBe('prequalified');
      expect(container.children).toHaveLength(1);
      expect(textOf('.amount__figure')).toBe('$12,500');
    });

    it('takes the card down when an update resolves to no amount', () => {
      const handle = mount('#capital', validConfig());
      expect(handle?.update(validConfig({ amount: null }))).toBe('none');
      expect(container.children).toHaveLength(0);
    });
  });

  describe('formatting', () => {
    it('drops fractions, which do not exist before bank review', () => {
      mount('#capital', validConfig({ amount: 40000.49 }));
      expect(textOf('.amount__figure')).toBe('$40,000');
    });

    it('honours the currency and locale it is given', () => {
      mount('#capital', validConfig({ amount: 40000, currency: 'GBP', locale: 'en-GB' }));
      expect(textOf('.amount__figure')).toBe('£40,000');
    });
  });

  it('makes no network request of any kind', () => {
    const network = trapNetwork();
    try {
      const handle = mount('#capital', validConfig({ onEvent: () => undefined }));
      handle?.update(validConfig({ amount: 999 }));
      clickCta(root());
      handle?.unmount();
      expect(network.calls).toEqual([]);
    } finally {
      network.restore();
    }
  });

  it('installs no observers and no timers', () => {
    const timer = vi.spyOn(globalThis, 'setInterval');
    const raf = vi.fn();
    (globalThis as Record<string, unknown>)['requestAnimationFrame'] = raf;
    mount('#capital', validConfig());
    expect(timer).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
  });
});
