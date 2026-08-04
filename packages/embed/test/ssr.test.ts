// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

/**
 * The integration has to work in a server-rendered framework, which means importing the package on
 * the server must be completely inert — no `document`, no `window`, no side effects at module
 * scope. These tests run with no DOM at all, so anything that reached for one would throw on
 * import rather than fail politely.
 */
describe('server-side rendering', () => {
  it('imports cleanly with no DOM present', async () => {
    expect(typeof globalThis.document).toBe('undefined');
    const embed = await import('../src/index');
    expect(typeof embed.mount).toBe('function');
    expect(embed.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('refuses to mount on the server, and says why, instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { mount } = await import('../src/index');

    const handle = mount('#capital', { amount: 40000, applyUrl: 'https://onrampfunds.com/p/a' });

    expect(handle).toBeNull();
    expect(warn.mock.calls.flat().join(' ')).toContain('needs a DOM');
    warn.mockRestore();
  });

  it('touches nothing global on import', async () => {
    const before = Object.keys(globalThis).sort().join(',');
    await import('../src/index');
    expect(Object.keys(globalThis).sort().join(',')).toBe(before);
  });
});
