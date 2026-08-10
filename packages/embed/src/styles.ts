import { CSS_VARS, MIX } from './constants';
import type { TokenKey } from './theme';

const V = CSS_VARS;

/** `color-mix(in oklab, <top> N%, <bottom>)`, written once so the guard and the sheet agree. */
function mix(top: string, weight: number, bottom: string): string {
  return `color-mix(in oklab, ${top} ${weight}%, ${bottom})`;
}

const accent = `var(${V.accent})`;
const accentText = `var(${V.accentText})`;
const surface = `var(${V.surface})`;
const text = `var(${V.text})`;
const border = `var(${V.border})`;
const radius = `var(${V.radius})`;

/** Muted tone against the card fill. */
const muted = (weight: number): string => mix(text, weight, surface);

/**
 * The card's entire stylesheet.
 *
 * Two things here are load-bearing rather than stylistic:
 *
 * - **`:host { display: block !important }`.** For important declarations the cascade runs the
 *   other way round — a shadow tree's rules beat the outer document's. The partner's stylesheet
 *   therefore cannot `display: none` our host, which is what keeps the "pre-qualified, not
 *   approved" qualifier from being deleted with CSS. They can of course hide their own container,
 *   which is their layout and their call; `unmount()` is the supported way to remove the card.
 * - **`.card { all: initial }`.** Inherited properties cross a shadow boundary. This resets every
 *   one of them at the root of our tree, so a partner's `line-height`, `letter-spacing`, or
 *   `text-transform` cannot reach inside. Custom properties are deliberately not reset by `all`,
 *   which is what lets the token block just below it work.
 */
export const BASE_CSS = `
:host {
  display: block !important;
  visibility: visible !important;
}
*, *::before, *::after { box-sizing: border-box; }

.card {
  all: initial;
  box-sizing: border-box;
  display: block;
  container-type: inline-size;
  width: 100%;
  overflow: hidden;
  text-align: left;
  font-family: var(${V.fontStack});
  font-size: 16px;
  font-weight: 400;
  line-height: 1.4;
  color: ${text};
  background: ${surface};
  border: 1px solid ${border};
  border-radius: ${radius};
  -webkit-font-smoothing: antialiased;
}
.card *, .card *::before, .card *::after { box-sizing: border-box; }

.rule {
  height: 3px;
  background: ${accent};
}

.body {
  display: flex;
  flex-direction: column;
  gap: clamp(14px, 4cqi, 22px);
  padding: clamp(14px, 4.5cqi, 26px);
}

.attribution {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  font-size: clamp(10px, 2.6cqi, 11.5px);
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: ${muted(MIX.attribution)};
}
.attribution__brand { display: flex; align-items: center; gap: 7px; }
.attribution__dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: ${accent};
}
.attribution__partner {
  letter-spacing: 0.04em;
  text-transform: none;
  font-weight: 500;
}

.stack { display: flex; flex-direction: column; gap: clamp(14px, 4cqi, 22px); }

.amount { display: flex; flex-direction: column; gap: clamp(10px, 3cqi, 14px); }
.amount__head { text-align: center; }
.amount__eyebrow {
  margin: 0 0 6px;
  font-size: clamp(10px, 2.7cqi, 12px);
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${muted(MIX.eyebrow)};
}
.amount__figure {
  margin: 0;
  font-size: clamp(34px, 12cqi, 64px);
  line-height: 1;
  font-weight: 600;
  letter-spacing: -0.03em;
}
.amount__band {
  margin: 0;
  padding: clamp(10px, 3cqi, 14px) clamp(11px, 3.2cqi, 16px);
  border: 1px solid ${mix(accent, MIX.bandBorder, surface)};
  border-radius: calc(${radius} / 1.6);
  background: ${mix(accent, MIX.bandFill, surface)};
  font-size: clamp(13px, 3.5cqi, 15px);
  line-height: 1.45;
  font-weight: 500;
}

.mechanism {
  display: flex;
  gap: clamp(9px, 2.6cqi, 12px);
  padding-top: clamp(12px, 3.4cqi, 18px);
  border-top: 1px solid ${border};
}
.mechanism__rule {
  flex: none;
  width: 2px;
  align-self: stretch;
  background: ${mix(accent, MIX.mechanismRule, surface)};
}
.mechanism__text {
  margin: 0;
  font-size: clamp(12.5px, 3.4cqi, 15px);
  line-height: 1.5;
  color: ${muted(MIX.mechanism)};
}

.action { display: flex; flex-direction: column; gap: 7px; }
.cta {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  /* Full width at every size, and never below a 44px target — at 300px the padding and type
     alone come to 42.9px, which is the one place the card would otherwise miss AA. */
  min-height: 44px;
  padding: clamp(11px, 3.2cqi, 14px) clamp(14px, 4cqi, 20px);
  border: 1px solid ${mix(accent, MIX.ctaBorder, '#000')};
  border-radius: calc(${radius} / 1.6);
  background: ${accent};
  color: ${accentText};
  font-family: inherit;
  font-size: clamp(14px, 3.8cqi, 16px);
  font-weight: 600;
  letter-spacing: -0.005em;
  line-height: 1.35;
  text-align: center;
  text-decoration: none;
}
/* Hover deliberately does not touch the fill or the label.
   The design handoff specifies an opacity change, but opacity composites the whole element —
   label included — against the card, so it lowers the very ratio the contrast guard just
   certified. Measured: an accent that passes at 4.50:1 falls to 3.71:1 on hover, and AA applies
   to every state. The affordance is carried by the border and a ring instead, both non-text
   boundaries, so the label pairing is identical hovered and not. */
.cta:hover {
  border-color: ${mix(accent, 60, '#000')};
  box-shadow: 0 0 0 3px ${mix(accent, 24, surface)};
}
.card--safe .cta:hover {
  border-color: ${text};
  box-shadow: 0 0 0 3px ${mix(text, 24, surface)};
}
.cta:focus-visible {
  outline: 2px solid ${text};
  outline-offset: 2px;
}
/* Safe mode — the last resort, when the body pairing itself cannot be rescued.
   Neutral everything: the accent survives only as the 3px top rule, and every other place it
   would normally appear is driven from the text and border tokens instead. Leaving the dot, the
   band, and the mechanism rule accent-coloured would keep presenting the partner's brand on a
   card we have just decided we cannot render legibly in it. */
.card--safe .cta {
  background: ${text};
  color: ${surface};
  border-color: ${text};
}
.card--safe .cta:focus-visible { outline-color: ${text}; }
/* Matches the attribution text it sits beside. */
.card--safe .attribution__dot { background: currentColor; }
.card--safe .amount__band {
  background: ${mix(text, MIX.disclosureFill, surface)};
  border-color: ${border};
}
/* Same visual weight as the accent version, in ink. */
.card--safe .mechanism__rule { background: ${mix(text, MIX.mechanismRule, surface)}; }

.departure {
  margin: 0;
  font-size: clamp(11px, 2.9cqi, 12.5px);
  line-height: 1.4;
  color: ${muted(MIX.departure)};
}

.disclosure {
  margin: 0;
  padding: clamp(10px, 3cqi, 14px) clamp(14px, 4.5cqi, 26px);
  border-top: 1px solid ${border};
  background: ${mix(text, MIX.disclosureFill, surface)};
  font-size: clamp(10.5px, 2.8cqi, 12px);
  line-height: 1.45;
  color: ${muted(MIX.disclosure)};
}

.skeleton { display: flex; flex-direction: column; gap: 14px; }
.skeleton__block { border-radius: 3px; }
.skeleton__block--eyebrow {
  height: clamp(12px, 3cqi, 14px);
  width: 40%;
  background: ${mix(border, MIX.skeletonMid, surface)};
}
.skeleton__block--figure {
  height: clamp(34px, 12cqi, 62px);
  width: 62%;
  border-radius: 4px;
  background: ${mix(border, MIX.skeletonStrong, surface)};
}
.skeleton__block--band {
  height: clamp(30px, 8cqi, 40px);
  border-radius: 4px;
  background: ${mix(border, MIX.skeletonSoft, surface)};
}
.skeleton__block--action {
  height: clamp(38px, 10cqi, 46px);
  border-radius: calc(${radius} / 1.6);
  background: ${mix(border, MIX.skeletonMid, surface)};
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip-path: inset(50%);
}

@media (prefers-reduced-motion: reduce) {
  .cta { transition: none; }
}
`;

/**
 * Anything reaching this point has already been validated — colours are re-serialised by
 * `toCssColor`, and radius and font stacks are matched against anchored patterns. This is one last
 * belt-and-braces pass so no token can terminate the rule it sits in.
 */
function cssSafe(value: string): string {
  return value.replace(/[;{}<>]/g, '');
}

/**
 * Builds the token block.
 *
 * The custom properties are declared on `.card` **inside** the shadow root rather than on the host
 * element. Custom properties inherit through a shadow boundary, so a partner who happened to set
 * `--orf-accent` anywhere above us would otherwise recolour the card; declaring them on the
 * element itself beats anything inherited, and the selector is unreachable from their stylesheet.
 */
export function tokenRule(tokens: Record<TokenKey, string>): string {
  const declarations: string[] = [
    `${V.accent}: ${cssSafe(tokens.accent)}`,
    `${V.accentText}: ${cssSafe(tokens.accentText)}`,
    `${V.surface}: ${cssSafe(tokens.surface)}`,
    `${V.text}: ${cssSafe(tokens.text)}`,
    `${V.border}: ${cssSafe(tokens.border)}`,
    `${V.radius}: ${cssSafe(tokens.radius)}`,
    `${V.fontStack}: ${cssSafe(tokens.fontStack)}`,
  ];
  return `.card{${declarations.join(';')};}`;
}
