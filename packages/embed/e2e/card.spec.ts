import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  CONFIG,
  HOSTILE_PARTNER_CSS,
  loadPartnerPage,
  mountCard,
  pressTab,
  styleOf,
  UMD_BUNDLE,
} from './fixture';

test.describe('style isolation', () => {
  test.beforeEach(async ({ page }) => {
    await loadPartnerPage(page, { partnerCss: HOSTILE_PARTNER_CSS });
    await mountCard(page, CONFIG);
  });

  test('the partner cannot hide the card, the qualifier, or the disclosure', async ({ page }) => {
    // This is the whole reason for the shadow root: the "pre-qualified, not approved" qualifier
    // is load-bearing and must not be reducible to a deletable line by the host page's CSS.
    for (const selector of ['.card', '.amount__band', '.disclosure', '.mechanism']) {
      const style = await styleOf(page, selector, ['display', 'visibility']);
      expect(style, `${selector} is missing`).not.toBeNull();
      expect(style?.['display'], `${selector} display`).not.toBe('none');
      expect(style?.['visibility'], `${selector} visibility`).not.toBe('hidden');
    }
  });

  test('the partner cannot hide our host element either', async ({ page }) => {
    // For important declarations the cascade runs the other way round, so `:host` wins.
    const host = await page.evaluate(() => {
      const node = document.querySelector('[data-onramp-embed]');
      if (node === null) return null;
      const computed = getComputedStyle(node);
      return { display: computed.display, visibility: computed.visibility };
    });
    expect(host).not.toBeNull();
    expect(host?.display).toBe('block');
    expect(host?.visibility).toBe('visible');
  });

  test('the partner cannot recolour the card, even through our own custom properties', async ({
    page,
  }) => {
    const card = await styleOf(page, '.card', ['background-color', 'color']);
    expect(card?.['background-color']).toBe('rgb(255, 255, 255)');
    expect(card?.['color']).toBe('rgb(22, 24, 29)');

    const disclosure = await styleOf(page, '.disclosure', ['color']);
    expect(disclosure?.['color']).not.toBe('rgb(255, 0, 255)');
  });

  test('the partner cannot restyle the type', async ({ page }) => {
    const figure = await styleOf(page, '.amount__figure', [
      'font-size',
      'letter-spacing',
      'text-transform',
      'font-family',
    ]);
    // 4px, 1em tracking, and uppercase were all asserted `!important` by the partner.
    expect(parseFloat(figure?.['font-size'] ?? '0')).toBeGreaterThan(20);
    expect(figure?.['text-transform']).toBe('none');
    expect(figure?.['font-family']).toContain('system-ui');

    const disclosure = await styleOf(page, '.disclosure', ['font-size']);
    expect(parseFloat(disclosure?.['font-size'] ?? '0')).toBeGreaterThanOrEqual(10.5);
  });

  test('the partner cannot disable the action', async ({ page }) => {
    const cta = await styleOf(page, '.cta', ['pointer-events', 'text-decoration-line']);
    expect(cta?.['pointer-events']).toBe('auto');
    expect(cta?.['text-decoration-line']).toBe('none');
  });

  test('and the card leaks nothing back into the partner page', async ({ page }) => {
    const partner = await page.evaluate(() => {
      const node = document.querySelector('#partner-copy');
      if (node === null) return null;
      return getComputedStyle(node).color;
    });
    // Still the partner's own (hostile) magenta — we did not override their page.
    expect(partner).toBe('rgb(255, 0, 255)');
  });
});

test.describe('the shadow root', () => {
  test('is asked for closed', async ({ page }) => {
    await loadPartnerPage(page);
    await mountCard(page, CONFIG);
    expect(await page.evaluate(() => window.__modes)).toEqual(['closed']);
  });

  test('is unreachable from a page that has not tampered with attachShadow', async ({ page }) => {
    // No interception here, so this is exactly what a partner's own script would see: the card
    // renders, and nothing in the page can get at the disclosure to rewrite or remove it.
    await loadPartnerPage(page, { capture: false });
    await mountCard(page, CONFIG);

    const probe = await page.evaluate(() => {
      const host = document.querySelector('[data-onramp-embed]');
      return {
        mounted: host !== null,
        shadowRoot: host?.shadowRoot ?? null,
        textLeaked: (document.body.textContent ?? '').includes('40,000'),
      };
    });

    expect(probe.mounted).toBe(true);
    expect(probe.shadowRoot).toBeNull();
    expect(probe.textLeaked).toBe(false);
  });
});

test.describe('content security policy', () => {
  test('installs styles through the CSSOM, not an inline <style>', async ({ page }) => {
    await loadPartnerPage(page);
    await mountCard(page, CONFIG);

    const how = await page.evaluate(() => {
      const root = window.__roots[0];
      return {
        adopted: root?.adoptedStyleSheets?.length ?? 0,
        styleElements: root?.querySelectorAll('style').length ?? 0,
        styled: getComputedStyle(root!.querySelector('.card')!).backgroundColor,
      };
    });

    // Rules inserted through the CSSOM are not subject to `style-src`, which is what lets a
    // partner adopt the card without touching their policy. The `<style>` fallback exists for
    // engines without adoptedStyleSheets — it must not be what runs on a supported browser.
    expect(how.adopted).toBe(1);
    expect(how.styleElements).toBe(0);
    expect(how.styled).toBe('rgb(255, 255, 255)');
  });

  test('renders under a style-src policy that forbids inline styles', async ({ page }) => {
    // A genuinely strict policy, with the bundle served same-origin so `'self'` covers it — the
    // partner allows our script source and nothing else, which is exactly the claim being tested.
    await page.route('https://partner.test/onramp-embed.umd.js', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/javascript',
        body: readFileSync(UMD_BUNDLE, 'utf8'),
      }),
    );
    await page.route('https://partner.test/dashboard', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        headers: { 'content-security-policy': "default-src 'self'; style-src 'none'" },
        body:
          '<!doctype html><html><body><div id="capital"></div>' +
          '<script src="/onramp-embed.umd.js"></script></body></html>',
      }),
    );
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
    await page.goto('https://partner.test/dashboard');
    await mountCard(page, CONFIG);

    const background = await page.evaluate(
      () => getComputedStyle(window.__roots[0]!.querySelector('.card')!).backgroundColor,
    );
    expect(background).toBe('rgb(255, 255, 255)');
  });
});

test.describe('the hover state', () => {
  test('does not change the action label pairing', async ({ page }) => {
    await loadPartnerPage(page);
    await mountCard(page, CONFIG);

    const resting = await styleOf(page, '.cta', ['background-color', 'color']);
    await page.evaluate(() => {
      (window.__roots[0]?.querySelector('.cta') as HTMLElement | null)?.focus();
    });
    await page.locator('#capital').hover();
    const hovered = await styleOf(page, '.cta', ['background-color', 'color', 'opacity']);

    // WCAG applies to every state. An `opacity` change would composite the label against the
    // card and quietly lower the ratio the contrast guard just certified — measured at 4.50:1
    // resting falling to 3.71:1 hovered. The affordance lives on the border and ring instead.
    expect(hovered?.['background-color']).toBe(resting?.['background-color']);
    expect(hovered?.['color']).toBe(resting?.['color']);
    expect(hovered?.['opacity']).toBe('1');
  });
});

test.describe('safe mode', () => {
  // A token set whose body pairing cannot be rescued, so the guard falls all the way through.
  const FAILING = { ...CONFIG, theme: { accent: '#f2e205', text: '#9aa0a6' } };

  test('reduces the accent to the top rule and nothing else', async ({ page }) => {
    await loadPartnerPage(page);
    await mountCard(page, FAILING);

    const accent = 'rgb(242, 226, 5)';

    // The one place it is allowed to survive.
    const rule = await styleOf(page, '.rule', ['background-color']);
    expect(rule?.['background-color']).toBe(accent);

    // Everywhere it would otherwise appear must now be neutral — otherwise safe mode still
    // presents the partner's brand on a card we just decided we cannot render legibly in it.
    for (const selector of ['.attribution__dot', '.mechanism__rule', '.amount__band']) {
      const style = await styleOf(page, selector, ['background-color', 'border-top-color']);
      expect(style?.['background-color'], `${selector} background`).not.toBe(accent);
      expect(style?.['border-top-color'], `${selector} border`).not.toBe(accent);
    }

    const cta = await styleOf(page, '.cta', ['background-color']);
    expect(cta?.['background-color']).not.toBe(accent);
  });

  test('is not entered by a token set that merely needs its label re-picked', async ({ page }) => {
    await loadPartnerPage(page);
    // Pale accent, unreadable label, but a perfectly legible body: the guard should fix only the
    // label and leave the partner's brand alone.
    await mountCard(page, { ...CONFIG, theme: { accent: '#f2e205', accentText: '#ffffff' } });

    const rule = await styleOf(page, '.rule', ['background-color']);
    expect(rule).toBeNull();

    const cta = await styleOf(page, '.cta', ['background-color', 'color']);
    expect(cta?.['background-color']).toBe('rgb(242, 226, 5)');
    expect(cta?.['color']).toBe('rgb(0, 0, 0)');
  });
});

test.describe('container queries', () => {
  const widthOf = async (
    page: import('@playwright/test').Page,
    width: string,
  ): Promise<number> => {
    await loadPartnerPage(page, { containerWidth: width });
    await mountCard(page, CONFIG);
    const style = await styleOf(page, '.amount__figure', ['font-size']);
    return parseFloat(style?.['font-size'] ?? '0');
  };

  test('size the card from its container, never the viewport', async ({ page }) => {
    // The three widths the design was verified at: sidebar, column, full row.
    const sidebar = await widthOf(page, '300px');
    const column = await widthOf(page, '520px');
    const fullRow = await widthOf(page, '900px');

    expect(sidebar).toBeGreaterThanOrEqual(34);
    expect(sidebar).toBeLessThan(column);
    expect(column).toBeLessThan(fullRow);
    expect(fullRow).toBeLessThanOrEqual(64);
  });

  test('do not react to the viewport at a fixed container width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loadPartnerPage(page, { containerWidth: '520px' });
    await mountCard(page, CONFIG);
    const wide = await styleOf(page, '.amount__figure', ['font-size']);

    await page.setViewportSize({ width: 420, height: 800 });
    const narrow = await styleOf(page, '.amount__figure', ['font-size']);

    expect(narrow?.['font-size']).toBe(wide?.['font-size']);
  });
});

test.describe('keyboard and screen reader', () => {
  test.beforeEach(async ({ page }) => {
    await loadPartnerPage(page);
    await mountCard(page, CONFIG);
  });

  test('reaches the action with Tab, and it is the only stop', async ({ page, browserName }) => {
    // Focus needs somewhere in-document to land after the card: when the CTA
    // is the last tabbable node on the page, engines disagree about what
    // activeElement reports once focus moves into browser chrome (Firefox
    // keeps the last in-page element, Chromium resets to the body).
    await page.evaluate(() => {
      const sentinel = document.createElement('button');
      sentinel.id = 'after-card';
      sentinel.textContent = 'after';
      document.body.append(sentinel);
    });

    await pressTab(page, browserName);

    const focused = await page.evaluate(() => {
      const root = window.__roots[0];
      const active = root?.activeElement;
      return active === null || active === undefined
        ? null
        : { className: active.className, tag: active.tagName };
    });
    expect(focused).toEqual({ className: 'cta', tag: 'A' });

    // A second Tab must leave the card entirely — there is only one focusable element.
    await pressTab(page, browserName);
    const after = await page.evaluate(() => ({
      stillInside: window.__roots[0]?.activeElement !== null,
      landedOn: document.activeElement?.id ?? null,
    }));
    expect(after.stillInside).toBe(false);
    expect(after.landedOn).toBe('after-card');
  });

  test('shows a visible focus ring when reached by keyboard', async ({ page, browserName }) => {
    await pressTab(page, browserName);
    const outline = await page.evaluate(() => {
      const cta = window.__roots[0]?.querySelector('.cta');
      if (cta === null || cta === undefined) return null;
      const computed = getComputedStyle(cta);
      return { width: computed.outlineWidth, style: computed.outlineStyle };
    });
    expect(outline?.style).toBe('solid');
    expect(parseFloat(outline?.width ?? '0')).toBeGreaterThanOrEqual(2);
  });

  test('names the region so it makes sense read alone', async ({ page }) => {
    const region = await page.evaluate(() => {
      const card = window.__roots[0]?.querySelector('.card');
      return card === null || card === undefined
        ? null
        : { role: card.getAttribute('role'), label: card.getAttribute('aria-label') };
    });
    expect(region?.role).toBe('region');
    expect(region?.label).toBe('Working capital pre-qualification from Onramp Funds');
  });

  test('keeps the action target at least 44px tall at the narrowest width', async ({ page }) => {
    await loadPartnerPage(page, { containerWidth: '300px' });
    await mountCard(page, CONFIG);
    const box = await page.evaluate(() => {
      const cta = window.__roots[0]?.querySelector('.cta');
      return cta === null || cta === undefined ? null : cta.getBoundingClientRect().height;
    });
    expect(box ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test.describe('network', () => {
  test('mounting the card issues no request at all', async ({ page }) => {
    const requests: string[] = [];
    await loadPartnerPage(page);

    // Count only what happens from here: the fixture's own bundle load is already done.
    page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`));
    await mountCard(page, CONFIG);
    await page.waitForTimeout(250);

    expect(requests).toEqual([]);
  });
});

test.describe('the click', () => {
  test('sends no referrer, so the partner dashboard URL never reaches Onramp', async ({ page }) => {
    await loadPartnerPage(page);
    await mountCard(page, CONFIG);

    let headers: Record<string, string> = {};
    await page.route('https://onrampfunds.com/**', async (route) => {
      headers = route.request().headers();
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>landed</p>' });
    });

    await page.evaluate(() => {
      const cta = window.__roots[0]?.querySelector('.cta') as HTMLAnchorElement | null;
      cta?.click();
    });
    await page.waitForURL('https://onrampfunds.com/**');

    // The attribute assertions live in the unit suite; this is the one that proves the browser
    // actually honours them on a real navigation.
    expect(headers['referer']).toBeUndefined();
  });

  test('navigates in the same tab, without opening a window', async ({ page }) => {
    await loadPartnerPage(page);
    await mountCard(page, CONFIG);
    await page.route('https://onrampfunds.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<p>landed</p>' }),
    );

    const before = page.context().pages().length;
    await page.evaluate(() => {
      const cta = window.__roots[0]?.querySelector('.cta') as HTMLAnchorElement | null;
      cta?.click();
    });
    await page.waitForURL('https://onrampfunds.com/**');

    expect(page.context().pages()).toHaveLength(before);
  });
});

test.describe('states', () => {
  test('no amount renders nothing and yields the slot', async ({ page }) => {
    await loadPartnerPage(page);
    await mountCard(page, { ...CONFIG, amount: null });

    const children = await page.evaluate(() => document.querySelector('#capital')?.children.length);
    expect(children).toBe(0);
    expect(await page.evaluate(() => window.__roots.length)).toBe(0);
  });
});
