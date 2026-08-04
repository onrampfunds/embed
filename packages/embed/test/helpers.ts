import { vi } from 'vitest';
import type { MountConfig } from '../src/types';

/**
 * The card mounts into a **closed** shadow root, so there is no supported way to reach inside it
 * from the page — which is the point. To assert on what it rendered, tests intercept
 * `attachShadow` and keep the root the library was handed, rather than weakening the library.
 */
export function captureShadowRoots(): {
  roots: ShadowRoot[];
  modes: string[];
  restore: () => void;
} {
  const roots: ShadowRoot[] = [];
  const modes: string[] = [];
  const original = Element.prototype.attachShadow;

  Element.prototype.attachShadow = function attachShadow(this: Element, init: ShadowRootInit) {
    modes.push(init.mode);
    // Opened only for the test's benefit; `modes` proves what production actually asks for.
    const root = original.call(this, { ...init, mode: 'open' });
    roots.push(root);
    return root;
  };

  return { roots, modes, restore: () => { Element.prototype.attachShadow = original; } };
}

export function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'capital';
  document.body.appendChild(container);
  return container;
}

/** The ticket's integration snippet, with a far-future expiry so it renders prequalified. */
export function validConfig(overrides: Partial<MountConfig> = {}): MountConfig {
  return {
    amount: 40000,
    currency: 'USD',
    validUntil: '2099-08-06T07:00:00Z',
    applyUrl: 'https://onrampfunds.com/p/abc123',
    lexicon: 'loan',
    locale: 'en-US',
  copy: {
    qualifier:
      'Pre-qualified, not approved. Onramp confirms the amount after reviewing your bank data.',
    mechanism:
      'Repaid automatically as a share of your daily sales. The fee, the rate, and the expected ' +
      'length are set after review.',
    disclosure:
      'Pre-qualification from Onramp Funds is not an offer of credit. All applications are ' +
      'subject to review prior to approval.',
    expiredDisclosure:
      'Pre-qualification from Onramp Funds is not an offer of credit. This estimate has expired.',
  },
    ...overrides,
  };
}

/** Replaces every way a browser can talk to the network, so a test can prove none is used. */
export function trapNetwork(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const scope = globalThis as Record<string, unknown>;
  const saved: Array<[string, unknown]> = [];

  const trap = (name: string, value: unknown): void => {
    saved.push([name, scope[name]]);
    scope[name] = value;
  };

  trap('fetch', (...args: unknown[]) => {
    calls.push(`fetch(${String(args[0])})`);
    return Promise.reject(new Error('network access is not allowed'));
  });
  trap('XMLHttpRequest', class { open(): void { calls.push('XMLHttpRequest'); } send(): void {} });
  trap('WebSocket', class { constructor() { calls.push('WebSocket'); } });
  trap('EventSource', class { constructor() { calls.push('EventSource'); } });
  trap('Image', class { set src(value: string) { calls.push(`Image(${value})`); } });

  const navigatorRef = globalThis.navigator as unknown as { sendBeacon?: unknown };
  const savedBeacon = navigatorRef?.sendBeacon;
  if (navigatorRef !== undefined) {
    navigatorRef.sendBeacon = (): boolean => {
      calls.push('sendBeacon');
      return true;
    };
  }

  return {
    calls,
    restore: () => {
      for (const [name, value] of saved) scope[name] = value;
      if (navigatorRef !== undefined) navigatorRef.sendBeacon = savedBeacon;
    },
  };
}

/**
 * Clicks the card's action.
 *
 * The extra listener is registered after the library's own, so it runs last: it records whether
 * the library prevented the navigation — it must not, the click is a real full-page navigation —
 * and then prevents it so jsdom does not try to follow the link.
 */
export function clickCta(root: ShadowRoot): { preventedByLibrary: boolean; href: string } {
  const cta = root.querySelector('a.cta') as HTMLAnchorElement | null;
  if (cta === null) throw new Error('the card rendered no action to click');

  let preventedByLibrary = false;
  cta.addEventListener('click', (event) => {
    preventedByLibrary = event.defaultPrevented;
    event.preventDefault();
  });
  cta.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  return { preventedByLibrary, href: cta.href };
}

export function silenceConsole(): { warns: string[]; errors: string[] } {
  const warns: string[] = [];
  const errors: string[] = [];
  vi.spyOn(console, 'warn').mockImplementation((...args) => { warns.push(args.join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args.join(' ')); });
  return { warns, errors };
}
