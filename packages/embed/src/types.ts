/** Which product vocabulary the card must use. Resolved from the merchant's state, server-side. */
export type Lexicon = 'loan' | 'mca';

/**
 * What the card decided to render.
 *
 * - `prequalified` — the full card. The only state that shows a figure.
 * - `mounting` — awaiting data: either the partner is still fetching, or a `data` promise is
 *   pending. Shows the static-block skeleton when asked to; a pending `data` mount shows
 *   nothing by default.
 * - `none` — nothing rendered; the slot is yielded back to the partner.
 * - `invalid` — the config was malformed. Nothing rendered, and the reason is logged.
 */
export type CardState = 'prequalified' | 'mounting' | 'none' | 'invalid';

/**
 * The whole themable surface: seven tokens, plus an optional partner name that lives on
 * {@link MountConfig} rather than here because it is content, not colour.
 *
 * Colours accept hex, `rgb()`, `hsl()`, `oklab()`, `oklch()`, and common named colours. A value we
 * cannot parse is replaced with the Onramp default and a warning is logged — we would rather show
 * a legible card in the wrong brand than an illegible one in the right brand.
 */
export interface ThemeTokens {
  /** Button fill, attribution dot, qualifier band tint and border. Never body text. */
  accent?: string;
  /** Button label colour. Replaced by the contrast guard if it fails against `accent`. */
  accentText?: string;
  /** Card fill, and the mix partner for every muted tone. */
  surface?: string;
  /** Amount, qualifier, mechanism. Muted variants are mixes toward `surface`. */
  text?: string;
  /** Card outline, rules, dividers, skeleton fills. */
  border?: string;
  /** Card corner, as a number of pixels or a CSS length. Inner elements derive from it. */
  radius?: string | number;
  /** Font stack, or one of the keywords `system`, `sans`, `serif`, `mono`. */
  fontStack?: string;
  /** Alias for {@link ThemeTokens.fontStack}. */
  font?: string;
}

/**
 * The regulated strings, served in the prequalification response rather than compiled in — so
 * compliance can revise them without a package release.
 *
 * They are **required**, not optional, and there are no baked fallbacks. A response missing one is
 * refused and the card renders nothing, which is safer than substituting compiled-in copy that
 * cannot be revised. A prequalified card needs `qualifier`, `mechanism` and `disclosure`.
 *
 * Typed optional because `mounting` and the no-amount case render no regulated copy at all.
 */
export interface ServedCopy {
  /** The "pre-qualified, not approved" band. Load-bearing, not decoration. */
  qualifier?: string;
  /** One sentence on how repayment works, and the promise of numbers before commitment. */
  mechanism?: string;
  /** The disclosure footer. */
  disclosure?: string;
}

/** Events reported back into the partner's page. The library never phones home. */
export type EmbedEvent = 'view' | 'click' | 'skip' | 'error';

export interface MountConfig {
  /** The prequalified amount in major currency units. `null` or omitted renders nothing. */
  amount?: number | null;
  /** ISO 4217 code. Defaults to `USD`. */
  currency?: string;
  /**
   * Where the primary action goes. Must be absolute `https:` — or `http:` on loopback
   * (`localhost`, `127.0.0.1`, `[::1]`), so a partner can develop against a local Onramp. The
   * library never constructs this URL, and the card names its host on the departure notice.
   */
  applyUrl?: string;
  /** Defaults to `loan`. An unrecognised value is refused rather than guessed. */
  lexicon?: Lexicon;
  /** Shown as "for {name}", and names the site the merchant is leaving. */
  partnerName?: string;
  /** BCP 47 tag used to format the amount and date. Defaults to the browser's locale. */
  locale?: string;
  /** Regulated strings from the prequalification response. */
  copy?: ServedCopy;
  /** Partner theme tokens. Mount-passed values override stored defaults per key. */
  theme?: ThemeTokens;
  /** Force the mounting placeholder while the partner fetches client-side. */
  state?: 'auto' | 'mounting';
  /**
   * The prequalification response, still in flight. When present, `mount()` waits for it and
   * renders on settle: the card, or nothing for a merchant with no offer. The library never
   * fetches — the page creates this promise, so the page owns auth, cancellation, and deadlines.
   *
   * The payload owns `amount`, `currency`, `applyUrl`, `lexicon`, and `copy`; passing any of
   * them beside `data` is refused. Keys beside `data` apply immediately: pass `state: 'mounting'`
   * to show the skeleton while pending — the default shows nothing until the promise settles.
   */
  data?: Promise<Partial<MountConfig>> | PromiseLike<Partial<MountConfig>>;
  /** Called for analytics in the partner's own page. Exceptions thrown here are swallowed. */
  onEvent?: (name: EmbedEvent, meta: Record<string, unknown>) => void;
}

export interface MountHandle {
  /** What is currently rendered. */
  readonly state: CardState;
  /** Re-render in place with a new config. Returns the resulting state. */
  update(next: MountConfig): CardState;
  /** Remove the card and every listener it installed. Safe to call more than once. */
  unmount(): void;
}
