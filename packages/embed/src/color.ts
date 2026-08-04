/**
 * Colour parsing, Oklab mixing, and WCAG contrast.
 *
 * The card derives almost every tone with `color-mix(in oklab, ...)` against the partner's own
 * tokens, so to check contrast honestly we have to be able to reproduce those mixes here. That is
 * the whole reason this file exists — it is not a general colour library and should not grow into
 * one.
 */

export interface RGBA {
  /** 0..1 */
  r: number;
  /** 0..1 */
  g: number;
  /** 0..1 */
  b: number;
  /** 0..1 */
  a: number;
}

/**
 * The named colours we accept. Deliberately short: partner theme tokens come out of design
 * systems as hex or `rgb()` essentially always, and a partner who hand-writes `rebeccapurple`
 * gets a console warning telling them to use a hex value rather than a silently wrong card.
 */
const NAMED = 'transparent:00000000,black:000,silver:c0c0c0,gray:808080,grey:808080,white:fff,maroon:800000,red:f00,purple:800080,fuchsia:f0f,magenta:f0f,green:008000,lime:0f0,olive:808000,yellow:ff0,navy:000080,blue:00f,teal:008080,aqua:0ff,cyan:0ff,orange:ffa500,pink:ffc0cb,brown:a52a2a,gold:ffd700,beige:f5f5dc,ivory:fffff0';

let namedMap: Map<string, string> | null = null;

function lookupNamed(name: string): string | undefined {
  if (namedMap === null) {
    namedMap = new Map();
    for (const entry of NAMED.split(',')) {
      const [key, value] = entry.split(':');
      if (key !== undefined && value !== undefined) namedMap.set(key, value);
    }
  }
  return namedMap.get(name);
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function parseHex(hex: string): RGBA | null {
  const h = hex.length === 8 || hex.length === 6 || hex.length === 4 || hex.length === 3 ? hex : null;
  if (h === null || !/^[0-9a-f]+$/.test(h)) return null;
  const short = h.length < 6;
  const size = short ? 1 : 2;
  const channel = (index: number): number => {
    const slice = h.slice(index * size, index * size + size);
    const value = parseInt(short ? slice + slice : slice, 16);
    return value / 255;
  };
  const hasAlpha = h.length === 4 || h.length === 8;
  return { r: channel(0), g: channel(1), b: channel(2), a: hasAlpha ? channel(3) : 1 };
}

/** Splits `1 2 3 / 0.5` and `1, 2, 3, 0.5` into a flat token list. */
function splitArgs(body: string): string[] {
  return body
    .replace(/[,/]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function alphaOf(token: string | undefined): number {
  if (token === undefined) return 1;
  const value = token.endsWith('%') ? parseFloat(token) / 100 : parseFloat(token);
  return Number.isFinite(value) ? clamp01(value) : 1;
}

/** An `rgb()` channel: `0..255`, or a percentage. */
function rgbChannel(token: string | undefined): number | null {
  if (token === undefined) return null;
  const value = parseFloat(token);
  if (!Number.isFinite(value)) return null;
  return clamp01(token.endsWith('%') ? value / 100 : value / 255);
}

/** A number that may be written as a percentage of `full`. */
function scalar(token: string | undefined, full: number): number | null {
  if (token === undefined) return null;
  const value = parseFloat(token);
  if (!Number.isFinite(value)) return null;
  return token.endsWith('%') ? (value / 100) * full : value;
}

function hueToRgb(p: number, q: number, t: number): number {
  let h = t;
  if (h < 0) h += 1;
  if (h > 1) h -= 1;
  if (h < 1 / 6) return p + (q - p) * 6 * h;
  if (h < 1 / 2) return q;
  if (h < 2 / 3) return p + (q - p) * (2 / 3 - h) * 6;
  return p;
}

function fromHsl(args: string[]): RGBA | null {
  const hToken = args[0];
  if (hToken === undefined) return null;
  const hue = parseFloat(hToken);
  const sat = scalar(args[1], 1);
  const light = scalar(args[2], 1);
  if (!Number.isFinite(hue) || sat === null || light === null) return null;
  const s = clamp01(sat);
  const l = clamp01(light);
  const h = (((hue % 360) + 360) % 360) / 360;
  if (s === 0) return { r: l, g: l, b: l, a: alphaOf(args[3]) };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToRgb(p, q, h + 1 / 3),
    g: hueToRgb(p, q, h),
    b: hueToRgb(p, q, h - 1 / 3),
    a: alphaOf(args[3]),
  };
}

function fromOklabArgs(args: string[]): RGBA | null {
  const L = scalar(args[0], 1);
  const a = scalar(args[1], 0.4);
  const b = scalar(args[2], 0.4);
  if (L === null || a === null || b === null) return null;
  const rgb = oklabToRgb({ L, a, b });
  return { ...rgb, a: alphaOf(args[3]) };
}

function fromOklchArgs(args: string[]): RGBA | null {
  const L = scalar(args[0], 1);
  const C = scalar(args[1], 0.4);
  const hToken = args[2];
  if (L === null || C === null || hToken === undefined) return null;
  const hue = parseFloat(hToken);
  if (!Number.isFinite(hue)) return null;
  const rad = (hue * Math.PI) / 180;
  const rgb = oklabToRgb({ L, a: C * Math.cos(rad), b: C * Math.sin(rad) });
  return { ...rgb, a: alphaOf(args[3]) };
}

/**
 * Parses the colour formats we accept: hex, `rgb()`, `hsl()`, `oklab()`, `oklch()`, and a short
 * list of named colours. Returns `null` for anything else, which callers treat as "cannot verify,
 * so do not use" rather than guessing.
 */
export function parseColor(input: unknown): RGBA | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim().toLowerCase();
  if (raw.length === 0 || raw.length > 128) return null;

  const named = lookupNamed(raw);
  if (named !== undefined) return parseHex(named);

  if (raw.charCodeAt(0) === 35 /* # */) return parseHex(raw.slice(1));

  const fn = /^([a-z]+)\(([^()]*)\)$/.exec(raw);
  if (fn === null) return null;
  const name = fn[1];
  const body = fn[2];
  if (name === undefined || body === undefined) return null;
  const args = splitArgs(body);

  switch (name) {
    case 'rgb':
    case 'rgba': {
      const r = rgbChannel(args[0]);
      const g = rgbChannel(args[1]);
      const b = rgbChannel(args[2]);
      if (r === null || g === null || b === null) return null;
      return { r, g, b, a: alphaOf(args[3]) };
    }
    case 'hsl':
    case 'hsla':
      return fromHsl(args);
    case 'oklab':
      return fromOklabArgs(args);
    case 'oklch':
      return fromOklchArgs(args);
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Oklab                                                                       */
/* -------------------------------------------------------------------------- */

interface Oklab {
  L: number;
  a: number;
  b: number;
}

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toGamma(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function rgbToOklab(c: RGBA): Oklab {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToRgb(c: Oklab): { r: number; g: number; b: number } {
  const l_ = c.L + 0.3963377774 * c.a + 0.2158037573 * c.b;
  const m_ = c.L - 0.1055613458 * c.a - 0.0638541728 * c.b;
  const s_ = c.L - 0.0894841775 * c.a - 1.291485548 * c.b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: clamp01(toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp01(toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp01(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  };
}

/**
 * Reproduces `color-mix(in oklab, top <weight>%, bottom)`.
 *
 * @param weight percentage of `top`, 0..100 — the same number written in the stylesheet.
 */
export function mixOklab(top: RGBA, bottom: RGBA, weight: number): RGBA {
  const t = clamp01(weight / 100);
  const x = rgbToOklab(top);
  const y = rgbToOklab(bottom);
  const rgb = oklabToRgb({
    L: y.L + (x.L - y.L) * t,
    a: y.a + (x.a - y.a) * t,
    b: y.b + (x.b - y.b) * t,
  });
  // Alpha interpolates in the sRGB inputs. `x` and `y` are Oklab, where `.a` is the green-red
  // axis, not opacity — reading it here would make every mix nearly transparent.
  return { ...rgb, a: bottom.a + (top.a - bottom.a) * t };
}

/* -------------------------------------------------------------------------- */
/* WCAG contrast                                                               */
/* -------------------------------------------------------------------------- */

function relativeLuminance(c: { r: number; g: number; b: number }): number {
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/** Composites a possibly translucent colour over an opaque backdrop. */
function flatten(fg: RGBA, bg: RGBA): { r: number; g: number; b: number } {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  };
}

/** WCAG 2.1 contrast ratio, 1..21. Translucent foregrounds are composited over `bg` first. */
export function contrastRatio(fg: RGBA, bg: RGBA): number {
  const a = relativeLuminance(flatten(fg, bg));
  const b = relativeLuminance(bg);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Serialises a parsed colour back to CSS.
 *
 * Token values are written into a stylesheet, so we emit **our own** serialisation rather than the
 * partner's original string. That closes a CSS injection route — `parseColor` is tolerant enough
 * that a string like `rgb(1 2 3;})` parses cleanly, and echoing it verbatim would let a token
 * terminate the rule it sits in. It also guarantees the colour that renders is exactly the one the
 * contrast guard measured.
 */
export function toCssColor(c: RGBA): string {
  const channel = (v: number): number => Math.round(clamp01(v) * 255);
  const r = channel(c.r);
  const g = channel(c.g);
  const b = channel(c.b);
  if (c.a >= 1) {
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${Math.round(clamp01(c.a) * 1000) / 1000})`;
}

const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };

/**
 * Picks black or white — whichever reads better on `background`. This is the recommended contrast
 * fallback from the design handoff: replace only the failing pairing and leave the partner's
 * accent alone.
 */
export function pickReadableInk(background: RGBA): { color: string; ratio: number } {
  const onBlack = contrastRatio(BLACK, background);
  const onWhite = contrastRatio(WHITE, background);
  return onBlack >= onWhite
    ? { color: '#000000', ratio: onBlack }
    : { color: '#ffffff', ratio: onWhite };
}
