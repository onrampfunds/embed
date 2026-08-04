import { describe, expect, it } from 'vitest';
import { CONTRAST, DEFAULT_TOKENS } from '../src/constants';
import { resolveTheme } from '../src/theme';
import { tokenRule } from '../src/styles';

describe('resolveTheme', () => {
  it('uses the Onramp defaults when the partner passes nothing', () => {
    const theme = resolveTheme(undefined);
    expect(theme.tokens).toEqual({ ...DEFAULT_TOKENS });
    expect(theme.safeMode).toBe(false);
    expect(theme.warnings).toEqual([]);
  });

  it('holds WCAG AA on every pairing with the default tokens', () => {
    const theme = resolveTheme(undefined);
    // If our own defaults ever stopped clearing AA, every partner would silently drop into safe
    // mode. This is the test that would catch it.
    for (const [name, ratio] of Object.entries(theme.ratios)) {
      expect(ratio, `${name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(CONTRAST.body);
    }
  });

  it('accepts the ticket integration snippet verbatim, including `font: system`', () => {
    const theme = resolveTheme({ accent: '#5B21B6', radius: 8, font: 'system' });
    expect(theme.tokens.accent).toBe('#5b21b6');
    expect(theme.tokens.radius).toBe('8px');
    expect(theme.tokens.fontStack).toContain('system-ui');
    expect(theme.safeMode).toBe(false);
  });

  it('replaces a token it cannot parse and says so', () => {
    const theme = resolveTheme({ accent: 'var(--brand-500)' });
    expect(theme.tokens.accent).toBe(DEFAULT_TOKENS.accent);
    expect(theme.warnings.join(' ')).toContain('theme.accent');
  });

  it('rejects a radius that is not a length', () => {
    expect(resolveTheme({ radius: 'calc(100% - 2px)' }).tokens.radius).toBe(DEFAULT_TOKENS.radius);
    expect(resolveTheme({ radius: -4 }).tokens.radius).toBe(DEFAULT_TOKENS.radius);
    expect(resolveTheme({ radius: '10' }).tokens.radius).toBe(DEFAULT_TOKENS.radius);
    expect(resolveTheme({ radius: 0 }).tokens.radius).toBe('0px');
    expect(resolveTheme({ radius: '1.5rem' }).tokens.radius).toBe('1.5rem');
  });

  it('accepts a zero radius in every notation, so a square partner stays square', () => {
    for (const radius of [0, '0', '0px', '0rem', '0em']) {
      const theme = resolveTheme({ radius });
      expect(theme.tokens.radius, `radius ${JSON.stringify(radius)}`).toBe(
        radius === 0 ? '0px' : radius,
      );
      expect(theme.warnings).toEqual([]);
    }
  });

  it('rejects a font stack carrying anything but families', () => {
    const theme = resolveTheme({ fontStack: 'Inter; } body { display: none' });
    expect(theme.tokens.fontStack).toBe(DEFAULT_TOKENS.fontStack);
    expect(theme.warnings.join(' ')).toContain('theme.fontStack');
  });

  it('names the font key the partner actually passed', () => {
    // Pointing at `theme.fontStack` when they wrote `theme.font` sends them to the wrong line.
    expect(resolveTheme({ font: 'Inter; }' }).warnings.join(' ')).toContain('theme.font:');
    expect(resolveTheme({ fontStack: 'Inter; }' }).warnings.join(' ')).toContain('theme.fontStack:');
  });

  it('bounds the radius identically whether it arrives as a number or a string', () => {
    // `400` and '400px' describe the same corner; accepting one and refusing the other is the
    // kind of inconsistency that costs someone an afternoon.
    expect(resolveTheme({ radius: 400 }).tokens.radius).toBe(DEFAULT_TOKENS.radius);
    expect(resolveTheme({ radius: '400px' }).tokens.radius).toBe(DEFAULT_TOKENS.radius);
    expect(resolveTheme({ radius: '9999px' }).tokens.radius).toBe(DEFAULT_TOKENS.radius);
    expect(resolveTheme({ radius: 200 }).tokens.radius).toBe('200px');
    expect(resolveTheme({ radius: '200px' }).tokens.radius).toBe('200px');
    expect(resolveTheme({ radius: '12.5rem' }).tokens.radius).toBe('12.5rem');
  });

  describe('the contrast guard', () => {
    it('re-picks the action label when it fails against the accent, and keeps the accent', () => {
      // The design handoff's realistic failing set: pale yellow accent, white label.
      const theme = resolveTheme({ accent: '#f2e205', accentText: '#ffffff' });
      expect(theme.tokens.accent).toBe('#f2e205');
      expect(theme.tokens.accentText).toBe('#000000');
      expect(theme.safeMode).toBe(false);
      expect(theme.warnings.join(' ')).toContain('Substituting');
    });

    it('drops to safe mode when the body pairing itself cannot be rescued', () => {
      const theme = resolveTheme({ text: '#9aa0a6', surface: '#ffffff' });
      expect(theme.safeMode).toBe(true);
      expect(theme.tokens.text).toBe(DEFAULT_TOKENS.text);
      expect(theme.tokens.surface).toBe(DEFAULT_TOKENS.surface);
      expect(theme.warnings.join(' ')).toContain('safe mode');
    });

    it('leaves a legitimate dark theme alone', () => {
      // Partner B from the design handoff: dark lime serif, square corners.
      const theme = resolveTheme({
        accent: '#c6f04e',
        accentText: '#10120e',
        surface: '#14161a',
        text: '#f2f4f0',
        border: '#2a2e35',
        radius: 2,
        fontStack: "Georgia, 'Times New Roman', serif",
      });
      expect(theme.safeMode).toBe(false);
      expect(theme.tokens.surface).toBe('#14161a');
      expect(theme.tokens.accent).toBe('#c6f04e');
    });

    it('keeps the disclosure legible, which is the tightest pairing on the card', () => {
      const theme = resolveTheme(undefined);
      expect(theme.ratios['disclosure']).toBeGreaterThanOrEqual(CONTRAST.body);
    });
  });
});

describe('tokenRule', () => {
  it('scopes the custom properties to the card inside the shadow root', () => {
    const rule = tokenRule(resolveTheme(undefined).tokens);
    expect(rule.startsWith('.card{')).toBe(true);
    expect(rule).toContain('--orf-accent: #3a2fd0');
    expect(rule).toContain('--orf-font: system-ui, sans-serif');
  });

  it('cannot be made to terminate its own rule', () => {
    const rule = tokenRule({
      ...resolveTheme(undefined).tokens,
      // Nothing can reach `tokenRule` in this shape — `toCssColor` re-serialises every colour
      // long before here — but the guard is cheap and the consequence of being wrong is a
      // partner value injecting selectors into our shadow root.
      accent: '#fff; } .disclosure { display: none } .x {',
    });
    // Whatever survives is stranded inside one custom property value: the rule still opens and
    // closes exactly once, so no new selector can exist.
    expect(rule.match(/\{/g)).toHaveLength(1);
    expect(rule.match(/\}/g)).toHaveLength(1);
    expect(rule).toContain('.card{');
    expect(rule.split('--orf-accent-text')[0]).not.toContain('.disclosure {');
  });
});
