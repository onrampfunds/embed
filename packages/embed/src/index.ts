import { LOG_PREFIX, VERSION } from './constants';
import { isExpectedApplyHost, normalize } from './config';
import { resolveCopy } from './copy';
import { formatAmount, formatDate } from './format';
import { attachStyles, renderCard } from './render';
import { resolveTheme, warn } from './theme';
import type { CardState, EmbedEvent, MountConfig, MountHandle } from './types';

export type {
  CardState,
  EmbedEvent,
  Lexicon,
  MountConfig,
  MountHandle,
  ServedCopy,
  ThemeTokens,
} from './types';

/** Marks our host element so a re-mount can clear the previous card instead of stacking on it. */
const HOST_ATTR = 'data-onramp-embed';

export const version = VERSION;

function fail(message: string): void {
  // eslint-disable-next-line no-console
  console.error(`${LOG_PREFIX} ${message}`);
}

/**
 * A real `Element` or nothing.
 *
 * Duck-typing on `nodeType === 1` would accept a plain `{ nodeType: 1 }`, which then throws deep
 * inside the render when we call `querySelectorAll` on it — turning a bad argument into an
 * exception in the partner's page instead of the logged no-op this library promises.
 *
 * The `ownerDocument` check matters for the same reason. `instanceof Element` only proves the same
 * JS realm, not the same document, so an element from `document.implementation.createHTMLDocument()`
 * would pass it — and everything we build afterwards comes from *this* document. `appendChild`
 * would silently adopt our host into an inert document, where it renders nothing and no style
 * applies. Refusing gives the caller the ordinary "did not match an element" message instead.
 */
function resolveTarget(target: unknown): Element | null {
  if (typeof target === 'string') {
    try {
      return document.querySelector(target);
    } catch {
      // `querySelector` throws a DOMException on an unparseable selector rather than returning
      // null. Letting that escape would be the same broken promise as accepting a bad element:
      // an exception in the partner's page where a logged no-op was documented.
      return null;
    }
  }
  if (!(target instanceof Element)) return null;
  return target.ownerDocument === document ? target : null;
}

/** A partner's analytics handler is not allowed to take the card down with it. */
function emitter(config: unknown): (name: EmbedEvent, meta: Record<string, unknown>) => void {
  const handler =
    config !== null && typeof config === 'object'
      ? (config as MountConfig).onEvent
      : undefined;
  if (typeof handler !== 'function') return () => undefined;
  return (name, meta) => {
    try {
      handler(name, meta);
    } catch {
      warn(`the onEvent handler threw while reporting "${name}"; the card is unaffected.`);
    }
  };
}

function clearPrevious(container: Element): void {
  const previous = container.querySelectorAll(`:scope > [${HOST_ATTR}]`);
  for (let i = 0; i < previous.length; i += 1) previous[i]?.remove();
}

/**
 * Renders the prequalification card into the partner's page.
 *
 * The library makes **no network calls**. Everything it renders is the configuration it was
 * handed, which the partner's backend fetched server-side.
 *
 * @returns a handle, or `null` when nothing was rendered — either because there is no amount, or
 * because the configuration was malformed. A `null` return is the partner's cue to render their
 * own fallback into the slot; it never means the merchant was rejected.
 */
export function mount(target: string | Element, config: MountConfig = {}): MountHandle | null {
  if (typeof document === 'undefined') {
    warn('mount() needs a DOM. Call it in the browser — on the client, after hydration.');
    return null;
  }

  const container = resolveTarget(target);
  if (container === null) {
    fail(
      `mount target ${JSON.stringify(String(target))} did not match an element. ` +
        'Nothing was rendered.',
    );
    return null;
  }

  let state: CardState = 'none';
  let host: HTMLElement | null = null;
  let detach: (() => void) | null = null;

  const teardown = (): void => {
    if (detach !== null) {
      detach();
      detach = null;
    }
    if (host !== null) {
      host.remove();
      host = null;
    }
  };

  const render = (raw: MountConfig): CardState => {
    teardown();
    clearPrevious(container);

    const emit = emitter(raw);
    const result = normalize(raw, new Date());

    if (!result.ok) {
      // Never a broken card in production: log it, render nothing.
      fail(`${result.reason}. Nothing was rendered.`);
      emit('error', { reason: result.reason });
      return 'invalid';
    }

    const config = result.config;
    if (config.state === 'none') {
      emit('skip', { reason: 'no-amount' });
      return 'none';
    }

    const theme = resolveTheme(config.theme);
    for (const message of theme.warnings) warn(message);

    const validUntilLabel =
      config.validUntil !== null ? formatDate(config.validUntil, config.locale) : null;

    // The card names the destination it was actually handed. An unexpected host is the partner's
    // integration being wrong, not grounds to refuse — but they should hear about it, because a
    // card carrying Onramp's attribution row should not be sending merchants somewhere else.
    if (config.applyHost !== null && !isExpectedApplyHost(config.applyHost)) {
      warn(
        `applyUrl points at ${config.applyHost}, which is not an Onramp host. The card will say ` +
          'so on the departure notice. Pass the applyUrl from the prequalification response ' +
          'unchanged.',
      );
    }

    const copy = resolveCopy({
      lexicon: config.lexicon,
      copy: config.copy,
      expired: config.state === 'expired',
      validUntil: validUntilLabel,
      partnerName: config.partnerName,
      applyHost: config.applyHost,
    });

    const amountLabel =
      config.amount !== null ? formatAmount(config.amount, config.currency, config.locale) : null;

    const nextHost = document.createElement('div');
    nextHost.setAttribute(HOST_ATTR, VERSION);
    // Closed: the partner's own scripts cannot reach in and rewrite the disclosure either.
    const shadow = nextHost.attachShadow({ mode: 'closed' });
    attachStyles(shadow, theme.tokens);

    const card = renderCard(document, {
      state: config.state,
      copy,
      amountLabel,
      applyUrl: config.applyUrl,
      partnerName: config.partnerName,
      safeMode: theme.safeMode,
    });
    shadow.appendChild(card.root);
    container.appendChild(nextHost);
    host = nextHost;

    if (card.cta !== null) {
      const cta = card.cta;
      const onClick = (): void => {
        emit('click', { applyUrl: config.applyUrl, state: config.state });
      };
      // Never prevented: the click is a real navigation, in the same tab, to the partner's URL.
      cta.addEventListener('click', onClick);
      detach = () => cta.removeEventListener('click', onClick);
    }

    if (config.state === 'expired') {
      emit('expired', { lexicon: config.lexicon });
    } else if (config.state === 'prequalified') {
      emit('view', {
        amount: config.amount,
        currency: config.currency,
        lexicon: config.lexicon,
        safeMode: theme.safeMode,
        copyFellBack: copy.fellBack,
      });
    }

    return config.state;
  };

  state = render(config);

  if (state === 'none' || state === 'invalid') return null;

  return {
    get state(): CardState {
      return state;
    },
    update(next: MountConfig): CardState {
      state = render(next);
      return state;
    },
    unmount(): void {
      teardown();
      state = 'none';
    },
  };
}
