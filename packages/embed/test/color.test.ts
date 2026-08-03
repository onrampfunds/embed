import { describe, expect, it } from 'vitest';
import { contrastRatio, mixOklab, parseColor, pickReadableInk, toCssColor } from '../src/color';

const near = (actual: number, expected: number, tolerance = 0.02): void => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
};

describe('parseColor', () => {
  it('parses hex in every length', () => {
    expect(parseColor('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor('#ffffff')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    const short = parseColor('#f00');
    expect(short?.r).toBe(1);
    expect(short?.g).toBe(0);
    const withAlpha = parseColor('#00000080');
    near(withAlpha?.a ?? 0, 0.5, 0.01);
  });

  it('parses rgb(), hsl(), oklab() and oklch()', () => {
    const rgb = parseColor('rgb(255, 0, 0)');
    expect(rgb?.r).toBe(1);
    expect(rgb?.g).toBe(0);

    const spaced = parseColor('rgb(0 0 255 / 50%)');
    expect(spaced?.b).toBe(1);
    near(spaced?.a ?? 0, 0.5, 0.01);

    const hsl = parseColor('hsl(0 100% 50%)');
    near(hsl?.r ?? 0, 1);
    near(hsl?.g ?? 1, 0);

    // The same purple in three notations should land in the same place.
    const hex = parseColor('#3a2fd0');
    const oklch = parseColor('oklch(0.42 0.22 275)');
    expect(oklch).not.toBeNull();
    near(oklch?.b ?? 0, hex?.b ?? 0, 0.12);
  });

  it('accepts the named colours it documents', () => {
    expect(parseColor('white')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor('  BLACK ')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    expect(parseColor('transparent')?.a).toBe(0);
  });

  it('refuses anything it cannot verify rather than guessing', () => {
    expect(parseColor('rebeccapurple')).toBeNull();
    expect(parseColor('var(--brand)')).toBeNull();
    expect(parseColor('not a colour')).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor(42)).toBeNull();
    expect(parseColor(null)).toBeNull();
    expect(parseColor('#12345')).toBeNull();
    expect(parseColor(`#${'f'.repeat(200)}`)).toBeNull();
  });
});

describe('toCssColor', () => {
  it('round-trips a colour', () => {
    expect(toCssColor(parseColor('#3a2fd0')!)).toBe('#3a2fd0');
    expect(toCssColor(parseColor('rgb(255 255 255)')!)).toBe('#ffffff');
  });

  it('re-serialises rather than echoing, so a token cannot terminate its CSS rule', () => {
    // `parseColor` is tolerant enough to accept this; the point is that what we write out is a
    // plain hex value, so the trailing `;}` can never reach the stylesheet.
    const hostile = parseColor('rgb(1 2 3;})');
    expect(hostile).not.toBeNull();
    const serialised = toCssColor(hostile!);
    expect(serialised).toBe('#010203');
    expect(serialised).not.toContain(';');
    expect(serialised).not.toContain('}');
  });

  it('keeps alpha when there is any', () => {
    expect(toCssColor({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('rgba(0, 0, 0, 0.5)');
  });
});

describe('mixOklab', () => {
  const white = parseColor('#ffffff')!;
  const ink = parseColor('#16181d')!;

  it('returns the endpoints at 0% and 100%', () => {
    expect(toCssColor(mixOklab(ink, white, 100))).toBe('#16181d');
    expect(toCssColor(mixOklab(ink, white, 0))).toBe('#ffffff');
  });

  it('moves monotonically between them', () => {
    const at40 = contrastRatio(mixOklab(ink, white, 40), white);
    const at66 = contrastRatio(mixOklab(ink, white, 66), white);
    const at90 = contrastRatio(mixOklab(ink, white, 90), white);
    expect(at40).toBeLessThan(at66);
    expect(at66).toBeLessThan(at90);
  });
});

describe('contrastRatio', () => {
  it('matches the known WCAG anchors', () => {
    const white = parseColor('#ffffff')!;
    const black = parseColor('#000000')!;
    near(contrastRatio(black, white), 21, 0.01);
    near(contrastRatio(white, white), 1, 0.01);
  });

  it('composites a translucent foreground over the backdrop', () => {
    const white = parseColor('#ffffff')!;
    const halfBlack = { r: 0, g: 0, b: 0, a: 0.5 };
    const ratio = contrastRatio(halfBlack, white);
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(21);
  });
});

describe('pickReadableInk', () => {
  it('picks black on a pale accent and white on a dark one', () => {
    expect(pickReadableInk(parseColor('#f2e205')!).color).toBe('#000000');
    expect(pickReadableInk(parseColor('#3a2fd0')!).color).toBe('#ffffff');
  });

  it('reports a ratio that clears AA for the pale-yellow case from the design handoff', () => {
    const picked = pickReadableInk(parseColor('#f2e205')!);
    expect(picked.ratio).toBeGreaterThanOrEqual(4.5);
  });
});
