import { REGION_LABEL } from './constants';
import type { ResolvedCopy } from './copy';
import { BASE_CSS, tokenRule } from './styles';
import type { TokenKey } from './theme';
import type { CardState } from './types';

/**
 * Every string on the card arrives from a partner or from our own server, so this module builds
 * DOM nodes and assigns `textContent`. There is no `innerHTML` anywhere in the library, and no
 * template string is ever parsed as markup.
 */

export interface RenderInput {
  state: Extract<CardState, 'prequalified' | 'mounting'>;
  copy: ResolvedCopy;
  /** Already formatted, or `null` in every state that must not show a figure. */
  amountLabel: string | null;
  applyUrl: string;
  partnerName: string | null;
  safeMode: boolean;
}

export interface RenderedCard {
  root: HTMLElement;
  /** The card's single focusable element, or `null` while mounting. */
  cta: HTMLAnchorElement | null;
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function decoration<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = el(doc, tag, className);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function attribution(doc: Document, copy: ResolvedCopy, partnerName: string | null): HTMLElement {
  const row = el(doc, 'p', 'attribution');
  const brand = el(doc, 'span', 'attribution__brand');
  brand.appendChild(decoration(doc, 'span', 'attribution__dot'));
  brand.appendChild(el(doc, 'span', undefined, copy.attribution));
  row.appendChild(brand);
  if (partnerName !== null) {
    row.appendChild(el(doc, 'span', 'attribution__partner', `for ${partnerName}`));
  }
  return row;
}

/**
 * Treatment B — the layout band, which the design handoff recommends. The qualifier occupies real
 * space directly under the figure rather than sitting in fine print, so it cannot be reduced to a
 * deletable line.
 */
function prequalified(doc: Document, copy: ResolvedCopy, amountLabel: string): HTMLElement {
  const stack = el(doc, 'div', 'stack');

  const amount = el(doc, 'div', 'amount');
  const head = el(doc, 'div', 'amount__head');
  head.appendChild(el(doc, 'p', 'amount__eyebrow', copy.eyebrow));
  head.appendChild(el(doc, 'p', 'amount__figure', amountLabel));
  amount.appendChild(head);
  // Directly adjacent to the figure and never separated by a focusable element: the amount and
  // its qualifier are one reading unit.
  amount.appendChild(el(doc, 'p', 'amount__band', copy.qualifier));
  stack.appendChild(amount);

  const mechanism = el(doc, 'div', 'mechanism');
  mechanism.appendChild(decoration(doc, 'span', 'mechanism__rule'));
  mechanism.appendChild(el(doc, 'p', 'mechanism__text', copy.mechanism));
  stack.appendChild(mechanism);

  return stack;
}

/** Static blocks at roughly the final height. No spinner, no motion, no live-region chatter. */
function mounting(doc: Document, copy: ResolvedCopy): HTMLElement {
  const block = el(doc, 'div', 'skeleton');
  block.setAttribute('aria-busy', 'true');
  block.appendChild(el(doc, 'span', 'sr-only', copy.loadingLabel));
  for (const variant of ['eyebrow', 'figure', 'band', 'action']) {
    block.appendChild(decoration(doc, 'div', `skeleton__block skeleton__block--${variant}`));
  }
  return block;
}

function action(doc: Document, copy: ResolvedCopy, applyUrl: string): {
  wrapper: HTMLElement;
  cta: HTMLAnchorElement;
} {
  const wrapper = el(doc, 'div', 'action');
  const cta = el(doc, 'a', 'cta', copy.ctaLabel);
  cta.href = applyUrl;
  // A full-page navigation in the same tab. Not a popup, not a new tab — the merchant is
  // deliberately leaving the partner's product and that should be honest rather than disguised.
  //
  // `noreferrer` is the load-bearing part. The card renders inside a merchant dashboard whose
  // URL routinely carries merchant identifiers in the path or query, and without this the
  // browser would hand that URL to onrampfunds.com on every click. We do not want it: the apply
  // URL identifies the referral on its own, and attribution runs off a first-party cookie set
  // after landing. Receiving partner data we never asked for is the opposite of the claim this
  // library makes.
  //
  // Set as attributes rather than IDL properties: that is what the HTML parser and every engine
  // reads, and it does not depend on a DOM implementation reflecting the property back.
  cta.setAttribute('rel', 'noopener noreferrer');
  cta.setAttribute('referrerpolicy', 'no-referrer');
  wrapper.appendChild(cta);
  wrapper.appendChild(el(doc, 'p', 'departure', copy.departure));
  return { wrapper, cta };
}

export function renderCard(doc: Document, input: RenderInput): RenderedCard {
  const root = el(doc, 'div', input.safeMode ? 'card card--safe' : 'card');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', REGION_LABEL);

  if (input.safeMode) root.appendChild(decoration(doc, 'div', 'rule'));

  const body = el(doc, 'div', 'body');
  body.appendChild(attribution(doc, input.copy, input.partnerName));

  let cta: HTMLAnchorElement | null = null;

  if (input.state === 'mounting') {
    body.appendChild(mounting(doc, input.copy));
  } else if (input.amountLabel !== null) {
    body.appendChild(prequalified(doc, input.copy, input.amountLabel));
    const built = action(doc, input.copy, input.applyUrl);
    body.appendChild(built.wrapper);
    cta = built.cta;
  }

  root.appendChild(body);

  // The disclosure is deliberately absent while mounting: nothing has been claimed yet, so there
  // is nothing to disclose, and a real disclosure under a skeleton would misdescribe what is
  // loading. Every state that shows or withholds a figure carries one.
  if (input.state !== 'mounting') {
    root.appendChild(el(doc, 'p', 'disclosure', input.copy.disclosure));
  }

  return { root, cta };
}

/**
 * Installs the stylesheet.
 *
 * Constructable stylesheets are preferred because rules inserted through the CSSOM are not subject
 * to `style-src`, so a partner needs no CSP change beyond allowing our script. The `<style>`
 * fallback exists for older engines and for jsdom, which does not implement `adoptedStyleSheets`.
 */
export function attachStyles(shadow: ShadowRoot, tokens: Record<TokenKey, string>): void {
  const css = BASE_CSS + tokenRule(tokens);
  const doc = shadow.ownerDocument;
  const view = doc.defaultView;

  if (view !== null && typeof view.CSSStyleSheet === 'function' && 'adoptedStyleSheets' in shadow) {
    try {
      const sheet = new view.CSSStyleSheet();
      sheet.replaceSync(css);
      shadow.adoptedStyleSheets = [sheet];
      return;
    } catch {
      // Fall through to a <style> element.
    }
  }

  const style = doc.createElement('style');
  style.textContent = css;
  shadow.appendChild(style);
}
