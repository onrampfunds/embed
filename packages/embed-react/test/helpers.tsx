import { StrictMode, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { MountConfig } from '@onrampfunds/embed';

/**
 * Counts shadow roots by intercepting `attachShadow`.
 *
 * The card mounts into a closed root, so nothing in the page can see inside it — and that is the
 * point. Every assertion here is about *how many times* a root was created and what the card
 * rendered, so the fixture keeps the roots the library was handed rather than weakening it.
 */
export function captureShadowRoots(): {
  roots: ShadowRoot[];
  restore: () => void;
} {
  const roots: ShadowRoot[] = [];
  const original = Element.prototype.attachShadow;

  Element.prototype.attachShadow = function attachShadow(this: Element, init: ShadowRootInit) {
    const root = original.call(this, { ...init, mode: 'open' });
    roots.push(root);
    return root;
  };

  return { roots, restore: () => { Element.prototype.attachShadow = original; } };
}

export interface Harness {
  container: HTMLElement;
  render: (element: ReactElement) => void;
  unmount: () => void;
  /** Host elements the core has actually left in the DOM — one per live card. */
  hosts: () => Element[];
  text: (selector: string) => string;
}

/** Renders into a real detached root, optionally under strict mode's double-invoked effects. */
export function mountHarness(options: { strict?: boolean } = {}): Harness {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = createRoot(container);

  const render = (element: ReactElement): void => {
    const tree = options.strict === true ? <StrictMode>{element}</StrictMode> : element;
    act(() => {
      root?.render(tree);
    });
  };

  const unmount = (): void => {
    act(() => {
      root?.unmount();
    });
    root = null;
  };

  const hosts = (): Element[] => [...container.querySelectorAll('[data-onramp-embed]')];

  const text = (selector: string): string => {
    for (const host of hosts()) {
      const shadow = (host as HTMLElement).shadowRoot;
      const found = shadow?.querySelector(selector);
      if (found !== null && found !== undefined) return (found.textContent ?? '').trim();
    }
    return '';
  };

  return { container, render, unmount, hosts, text };
}

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
