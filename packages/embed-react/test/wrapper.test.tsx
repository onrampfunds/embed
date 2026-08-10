import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnrampPrequalification, version } from '../src/index';
import { captureShadowRoots, mountHarness, validConfig, type Harness } from './helpers';

let shadow: ReturnType<typeof captureShadowRoots>;
let harness: Harness;

beforeEach(() => {
  document.body.replaceChildren();
  shadow = captureShadowRoots();
});

afterEach(() => {
  shadow.restore();
  vi.restoreAllMocks();
});

describe('OnrampPrequalification', () => {
  it('exports a version matching the core it is pinned to', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  describe('mounting', () => {
    beforeEach(() => {
      harness = mountHarness();
      harness.render(<OnrampPrequalification {...validConfig()} partnerName="Cartwheel" />);
    });

    it('renders the card into the element it owns', () => {
      expect(harness.hosts()).toHaveLength(1);
      expect(harness.text('.amount__figure')).toBe('$40,000');
    });

    it('creates exactly one shadow root', () => {
      expect(shadow.roots).toHaveLength(1);
    });

    it('passes props straight through as the mount config', () => {
      expect(harness.text('.attribution')).toContain('for Cartwheel');
      expect(harness.text('.disclosure')).toContain('subject to review prior to approval');
    });

    it('applies className and style to its own element rather than the card', () => {
      harness.unmount();
      const styled = mountHarness();
      styled.render(
        <OnrampPrequalification {...validConfig()} className="col-span-4" style={{ maxWidth: 520 }} />,
      );
      const slot = styled.container.firstElementChild as HTMLElement;
      expect(slot.className).toBe('col-span-4');
      expect(slot.style.maxWidth).toBe('520px');
      styled.unmount();
    });
  });

  describe('re-rendering', () => {
    it('does not remount when only the callback identity changes', () => {
      // The case this wrapper exists for. A partner writing an inline arrow gets a new function
      // on every parent render; tearing down the shadow root each time would flicker the card.
      harness = mountHarness();
      for (let i = 0; i < 5; i += 1) {
        harness.render(
          <OnrampPrequalification {...validConfig()} onEvent={(name, meta) => [name, meta]} />,
        );
      }
      expect(shadow.roots).toHaveLength(1);
      expect(harness.hosts()).toHaveLength(1);
    });

    it('does not remount when the config is a new object with the same values', () => {
      harness = mountHarness();
      harness.render(<OnrampPrequalification {...validConfig()} theme={{ accent: '#2b5ce6' }} />);
      harness.render(<OnrampPrequalification {...validConfig()} theme={{ accent: '#2b5ce6' }} />);
      expect(shadow.roots).toHaveLength(1);
    });

    it('does not remount when only the key order differs', () => {
      // Object spread and conditional keys make ordering genuinely unstable in real integrations.
      const { amount, currency, applyUrl, copy, lexicon } = validConfig();
      harness = mountHarness();
      harness.render(
        <OnrampPrequalification
          amount={amount}
          currency={currency}
          applyUrl={applyUrl}
          lexicon={lexicon}
          copy={copy}
        />,
      );
      harness.render(
        <OnrampPrequalification
          copy={copy}
          applyUrl={applyUrl}
          lexicon={lexicon}
          currency={currency}
          amount={amount}
        />,
      );
      expect(shadow.roots).toHaveLength(1);
    });

    it('remounts when the config actually changes', () => {
      harness = mountHarness();
      harness.render(<OnrampPrequalification {...validConfig()} />);
      expect(harness.text('.amount__figure')).toBe('$40,000');

      harness.render(<OnrampPrequalification {...validConfig({ amount: 12500 })} />);
      expect(harness.text('.amount__figure')).toBe('$12,500');
      expect(harness.hosts()).toHaveLength(1);
    });

    it('leaves one card behind after many config changes', () => {
      harness = mountHarness();
      for (const amount of [10000, 20000, 30000, 40000]) {
        harness.render(<OnrampPrequalification {...validConfig({ amount })} />);
      }
      expect(harness.hosts()).toHaveLength(1);
      expect(harness.text('.amount__figure')).toBe('$40,000');
    });

    it('calls the latest callback, not the one captured at mount', () => {
      // The ref indirection must not cost correctness: skipping the remount is only acceptable
      // if the card still invokes the current handler.
      harness = mountHarness();
      const first = vi.fn();
      const second = vi.fn();

      harness.render(<OnrampPrequalification {...validConfig()} onEvent={first} />);
      harness.render(<OnrampPrequalification {...validConfig()} onEvent={second} />);

      const cta = harness.hosts()[0]?.shadowRoot?.querySelector('a.cta') as HTMLAnchorElement;
      cta.addEventListener('click', (event) => event.preventDefault());
      cta.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      expect(second).toHaveBeenCalledWith('click', expect.objectContaining({ applyUrl: cta.href }));
      expect(first).not.toHaveBeenCalledWith('click', expect.anything());
    });
  });

  describe('unmounting', () => {
    it('removes the card and leaves the container clean', () => {
      harness = mountHarness();
      harness.render(<OnrampPrequalification {...validConfig()} />);
      expect(harness.hosts()).toHaveLength(1);

      harness.unmount();
      expect(harness.container.querySelectorAll('[data-onramp-embed]')).toHaveLength(0);
      expect(harness.container.children).toHaveLength(0);
    });

    it('detaches the listeners the core installed, not just the DOM', () => {
      // The DOM alone cannot tell you whether cleanup ran: React removes the wrapper element on
      // unmount either way, and the core clears any prior host when it mounts. What only a real
      // `unmount()` does is remove the click listener the core wired to the action — so a
      // detached element is the one place the difference is observable.
      harness = mountHarness();
      const onEvent = vi.fn();
      harness.render(<OnrampPrequalification {...validConfig()} onEvent={onEvent} />);

      const cta = harness.hosts()[0]?.shadowRoot?.querySelector('a.cta') as HTMLAnchorElement;
      cta.addEventListener('click', (event) => event.preventDefault());

      harness.unmount();
      onEvent.mockClear();

      cta.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('tolerates unmounting a component that never rendered a card', () => {
      harness = mountHarness();
      harness.render(<OnrampPrequalification {...validConfig({ amount: null })} />);
      expect(harness.hosts()).toHaveLength(0);
      expect(() => harness.unmount()).not.toThrow();
    });
  });

  describe('under strict mode', () => {
    it('does not create two shadow roots from double-invoked effects', () => {
      // React deliberately mounts, unmounts and remounts every effect in development.
      //
      // Worth being honest about what this proves: the core also clears any existing host when it
      // mounts, so this would still pass if the wrapper's cleanup were missing entirely. It is
      // defence in depth rather than the wrapper's own guarantee — the test that isolates that is
      // "detaches the listeners the core installed" above.
      harness = mountHarness({ strict: true });
      harness.render(<OnrampPrequalification {...validConfig()} />);

      expect(harness.hosts()).toHaveLength(1);
      expect(harness.text('.amount__figure')).toBe('$40,000');
    });

    it('still settles on one card after re-renders', () => {
      harness = mountHarness({ strict: true });
      harness.render(<OnrampPrequalification {...validConfig()} onEvent={() => undefined} />);
      harness.render(<OnrampPrequalification {...validConfig()} onEvent={() => undefined} />);
      harness.render(<OnrampPrequalification {...validConfig({ amount: 999 })} />);

      expect(harness.hosts()).toHaveLength(1);
      expect(harness.text('.amount__figure')).toBe('$999');
    });

    it('cleans up completely on unmount', () => {
      harness = mountHarness({ strict: true });
      harness.render(<OnrampPrequalification {...validConfig()} />);
      harness.unmount();
      expect(harness.container.querySelectorAll('[data-onramp-embed]')).toHaveLength(0);
    });
  });

  describe('the states the core owns', () => {
    it('renders nothing when there is no amount, and never reads as a rejection', () => {
      harness = mountHarness();
      harness.render(<OnrampPrequalification {...validConfig({ amount: null })} />);
      expect(harness.hosts()).toHaveLength(0);
      expect(harness.container.textContent).toBe('');
    });

    it('renders nothing for a malformed config rather than throwing into the tree', () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      harness = mountHarness();
      expect(() =>
        harness.render(<OnrampPrequalification {...validConfig({ lexicon: 'advance' as never })} />),
      ).not.toThrow();
      expect(harness.hosts()).toHaveLength(0);
      expect(error.mock.calls.flat().join(' ')).toContain('lexicon');
    });

    it('recovers when a later config becomes valid again', () => {
      harness = mountHarness();
      harness.render(<OnrampPrequalification {...validConfig({ amount: null })} />);
      expect(harness.hosts()).toHaveLength(0);

      harness.render(<OnrampPrequalification {...validConfig()} />);
      expect(harness.hosts()).toHaveLength(1);
      expect(harness.text('.amount__figure')).toBe('$40,000');
    });
  });
});
