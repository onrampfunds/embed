import { expect, test } from '@playwright/test';
import { CONFIG, HOSTILE_PARTNER_CSS, loadPartnerPage, mountCard, styleOf } from './fixture';

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

  test('reaches the action with Tab, and it is the only stop', async ({ page }) => {
    await page.keyboard.press('Tab');

    const focused = await page.evaluate(() => {
      const root = window.__roots[0];
      const active = root?.activeElement;
      return active === null || active === undefined
        ? null
        : { className: active.className, tag: active.tagName };
    });
    expect(focused).toEqual({ className: 'cta', tag: 'A' });

    // A second Tab must leave the card entirely — there is only one focusable element.
    await page.keyboard.press('Tab');
    const stillInside = await page.evaluate(() => window.__roots[0]?.activeElement !== null);
    expect(stillInside).toBe(false);
  });

  test('shows a visible focus ring when reached by keyboard', async ({ page }) => {
    await page.keyboard.press('Tab');
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

test.describe('states', () => {
  test('the expired card carries no figure anywhere in the tree', async ({ page }) => {
    await loadPartnerPage(page);
    await mountCard(page, { ...CONFIG, validUntil: '2020-01-01T00:00:00Z' });

    const html = await page.evaluate(() => window.__roots[0]?.innerHTML ?? '');
    expect(html).not.toContain('40,000');
    expect(html).toContain('out of date');
  });

  test('no amount renders nothing and yields the slot', async ({ page }) => {
    await loadPartnerPage(page);
    await mountCard(page, { ...CONFIG, amount: null });

    const children = await page.evaluate(() => document.querySelector('#capital')?.children.length);
    expect(children).toBe(0);
    expect(await page.evaluate(() => window.__roots.length)).toBe(0);
  });
});
