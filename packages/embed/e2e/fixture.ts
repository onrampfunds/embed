import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Page } from '@playwright/test';
import type { MountConfig } from '../src/types';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The CDN build, which is what a partner actually drops into their page. */
export const UMD_BUNDLE = path.resolve(here, '../dist/onramp-embed.umd.js');

declare global {
  interface Window {
    /** Roots captured by the fixture, so a test can see inside a closed shadow tree. */
    __roots: ShadowRoot[];
    __modes: string[];
    Onramp: { mount: (target: string, config: MountConfig) => unknown; version: string };
  }
}

/**
 * A partner page that is actively hostile to the card: it tries to hide it, recolour it, shrink
 * it, and override our custom properties from above. Everything here is legal CSS a real partner
 * could ship by accident — a `* { }` reset is not rare.
 */
export const HOSTILE_PARTNER_CSS = `
  * {
    color: magenta !important;
    font-size: 4px !important;
    letter-spacing: 1em !important;
    text-transform: uppercase !important;
    line-height: 3 !important;
  }
  div, p, span, a { background: magenta !important; border-color: magenta !important; }
  a { pointer-events: none !important; text-decoration: line-through !important; }

  /* Targeted attempts at the compliance-bearing parts. */
  .card, .disclosure, .amount__band, .mechanism { display: none !important; }
  [data-onramp-embed] { display: none !important; visibility: hidden !important; }

  /* Custom properties inherit through a shadow boundary, so try to recolour it from above. */
  :root, html, body, #capital {
    --orf-accent: magenta;
    --orf-text: magenta;
    --orf-surface: magenta;
    --orf-border: magenta;
    --orf-font: cursive;
    --orf-radius: 40px;
  }
`;

interface FixtureOptions {
  partnerCss?: string;
  containerWidth?: string;
  /**
   * Whether to intercept `attachShadow` so a test can see inside. Pass `false` to get a page that
   * behaves exactly as a partner's would — which is the only honest way to assert that a closed
   * root really is unreachable.
   */
  capture?: boolean;
}

/**
 * Loads a partner page with the card's shadow roots captured.
 *
 * The library uses a closed root, so nothing — including Playwright's locators — can reach inside
 * it. Rather than weaken the library for testing, the fixture intercepts `attachShadow` before the
 * bundle loads and keeps a reference, recording the mode that was actually requested so a test can
 * prove it is still closed in production.
 */
export async function loadPartnerPage(page: Page, options: FixtureOptions = {}): Promise<void> {
  if (options.capture !== false) {
    await page.addInitScript(() => {
      window.__roots = [];
      window.__modes = [];
      const original = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function attachShadow(this: Element, init: ShadowRootInit) {
        window.__modes.push(init.mode);
        const root = original.call(this, { ...init, mode: 'open' });
        window.__roots.push(root);
        return root;
      };
    });
  }

  await page.goto('about:blank');
  await page.setContent(
    `<!doctype html>
     <html><head><meta charset="utf-8"><style>
       body { margin: 0; font-family: system-ui, sans-serif; }
       #capital { width: ${options.containerWidth ?? '520px'}; }
       ${options.partnerCss ?? ''}
     </style></head>
     <body>
       <p id="partner-copy">Partner content that must be left alone.</p>
       <div id="capital"></div>
     </body></html>`,
  );
  await page.addScriptTag({ path: UMD_BUNDLE });
}

export async function mountCard(page: Page, config: MountConfig): Promise<void> {
  await page.evaluate((cfg) => {
    window.Onramp.mount('#capital', cfg as MountConfig);
  }, config as unknown as Record<string, unknown>);
}

/**
 * A Tab keypress that reaches links on every engine. WebKit on macOS keeps
 * Safari's "Option+Tab to reach links" behaviour, so a bare Tab skips the
 * card's anchor entirely; the Linux builds that run in CI honour a plain Tab.
 */
export async function pressTab(
  page: Page,
  browserName: 'chromium' | 'firefox' | 'webkit',
): Promise<void> {
  const key =
    browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
  await page.keyboard.press(key);
}

/** Resolved styles for one element inside the captured shadow root. */
export async function styleOf(
  page: Page,
  selector: string,
  properties: string[],
): Promise<Record<string, string> | null> {
  return page.evaluate(
    ({ sel, props }) => {
      const root = window.__roots[0];
      if (root === undefined) return null;
      const node = root.querySelector(sel);
      if (node === null) return null;
      const computed = getComputedStyle(node);
      const out: Record<string, string> = {};
      for (const property of props) out[property] = computed.getPropertyValue(property);
      return out;
    },
    { sel: selector, props: properties },
  );
}

export const CONFIG: MountConfig = {
  amount: 40000,
  currency: 'USD',
  applyUrl: 'https://onrampfunds.com/p/abc123',
  lexicon: 'loan',
  locale: 'en-US',
  partnerName: 'Cartwheel',
  copy: {
    qualifier:
      'Pre-qualified, not approved. Onramp confirms the amount after reviewing your bank data.',
    mechanism:
      'Repaid automatically as a share of your daily sales. The fee, the rate, and the expected ' +
      'length are set after review.',
    disclosure:
      'Pre-qualification from Onramp Funds is not an offer of credit. All applications are ' +
      'subject to review prior to approval.',
  },
};
