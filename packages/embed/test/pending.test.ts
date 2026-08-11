import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../src/index';
import type { MountConfig } from '../src/types';
import { captureShadowRoots, makeContainer, silenceConsole, validConfig } from './helpers';

let container: HTMLElement;
let shadow: ReturnType<typeof captureShadowRoots>;

beforeEach(() => {
  document.body.replaceChildren();
  container = makeContainer();
  shadow = captureShadowRoots();
});

afterEach(() => {
  shadow.restore();
  vi.restoreAllMocks();
});

/** The settle handler runs on the microtask queue; two ticks put every assertion after it. */
export const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/** A promise the test settles by hand, so order of events is the test's to choose. */
export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('mount with data', () => {
  describe('synchronous refusals', () => {
    it('refuses a non-thenable data value', () => {
      silenceConsole();
      const onEvent = vi.fn();
      const handle = mount(container, { data: 'soon' as never, onEvent });
      expect(handle).toBeNull();
      expect(onEvent).toHaveBeenCalledWith('error', expect.objectContaining({ reason: expect.any(String) }));
    });

    it('refuses data-bearing fields beside data, naming them', () => {
      silenceConsole();
      const onEvent = vi.fn();
      const handle = mount(container, {
        data: Promise.resolve({}),
        amount: 40000,
        copy: { qualifier: 'x' },
        onEvent,
      });
      expect(handle).toBeNull();
      const reason = (onEvent.mock.calls[0]?.[1] as { reason: string }).reason;
      expect(reason).toContain('amount');
      expect(reason).toContain('copy');
    });

    it('refuses a bad state value beside data', () => {
      silenceConsole();
      const handle = mount(container, { data: Promise.resolve({}), state: 'loading' as never });
      expect(handle).toBeNull();
    });
  });

  describe('silent pending (the default)', () => {
    it('returns a live handle reporting mounting, with nothing in the DOM', () => {
      const { promise } = deferred<Partial<MountConfig>>();
      const handle = mount(container, { data: promise });
      expect(handle).not.toBeNull();
      expect(handle?.state).toBe('mounting');
      expect(container.children).toHaveLength(0);
      expect(shadow.roots).toHaveLength(0);
    });

    it('renders the card when the promise resolves, and emits view', async () => {
      const { promise, resolve } = deferred<Partial<MountConfig>>();
      const onEvent = vi.fn();
      const handle = mount(container, { data: promise, onEvent });

      resolve(validConfig());
      await settle();

      expect(handle?.state).toBe('prequalified');
      expect(container.children).toHaveLength(1);
      const root = shadow.roots[shadow.roots.length - 1];
      expect(root?.querySelector('.amount__figure')?.textContent?.trim()).toBe('$40,000');
      expect(onEvent).toHaveBeenCalledWith('view', expect.objectContaining({ amount: 40000 }));
    });

    it('applies mount-time theme tokens over stored payload tokens', async () => {
      const { promise, resolve } = deferred<Partial<MountConfig>>();
      mount(container, { data: promise, theme: { accent: '#5B21B6' } });

      resolve(validConfig({ theme: { accent: '#111111' } }));
      await settle();

      // attachStyles() writes resolveTheme()'s tokens as custom properties on a <style> element
      // in the shadow root (jsdom has no adoptedStyleSheets) — the same mechanism theme.test.ts
      // asserts on via tokenRule(). The resolved card must carry the mount-time accent, not the
      // one stored on the payload.
      const root = shadow.roots[shadow.roots.length - 1];
      const css = root?.querySelector('style')?.textContent ?? '';
      expect(css).toContain('--orf-accent: #5b21b6');
      expect(css).not.toContain('#111111');
    });

    it('keeps the mount-time onEvent across the resolve', async () => {
      const { promise, resolve } = deferred<Partial<MountConfig>>();
      const onEvent = vi.fn();
      mount(container, { data: promise, onEvent });

      resolve(validConfig());
      await settle();

      expect(onEvent).toHaveBeenCalledWith('view', expect.anything());
    });
  });
});
