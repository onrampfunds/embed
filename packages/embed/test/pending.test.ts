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
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/** A promise the test settles by hand, so order of events is the test's to choose. */
function deferred<T>(): {
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

    it('refuses a value whose then accessor throws, without the exception escaping', () => {
      silenceConsole();
      const onEvent = vi.fn();
      const trap = Object.defineProperty({}, 'then', {
        get() {
          throw new Error('hostile accessor');
        },
      });
      const handle = mount(container, { data: trap as never, onEvent });
      expect(handle).toBeNull();
      expect(onEvent).toHaveBeenCalledWith('error', expect.objectContaining({ reason: expect.any(String) }));
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

    it('clears a previously mounted card immediately, like every other mount', () => {
      mount(container, validConfig());
      expect(container.children).toHaveLength(1);

      const { promise } = deferred<Partial<MountConfig>>();
      const handle = mount(container, { data: promise });

      expect(handle?.state).toBe('mounting');
      expect(container.children).toHaveLength(0);
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

  describe('settle outcomes', () => {
    it('yields the slot and emits skip when the payload has no amount', async () => {
      const { promise, resolve } = deferred<Partial<MountConfig>>();
      const onEvent = vi.fn();
      const handle = mount(container, { data: promise, onEvent });

      resolve({ amount: null });
      await settle();

      expect(handle?.state).toBe('none');
      expect(container.children).toHaveLength(0);
      expect(onEvent).toHaveBeenCalledWith('skip', { reason: 'no-amount' });
      expect(onEvent).not.toHaveBeenCalledWith('view', expect.anything());
    });

    it('treats a zero amount exactly like null', async () => {
      const { promise, resolve } = deferred<Partial<MountConfig>>();
      const onEvent = vi.fn();
      const handle = mount(container, { data: promise, onEvent });

      resolve({ ...validConfig(), amount: 0 });
      await settle();

      expect(handle?.state).toBe('none');
      expect(container.children).toHaveLength(0);
      expect(onEvent).toHaveBeenCalledWith('skip', { reason: 'no-amount' });
    });

    it('yields the slot and emits error on rejection — never an error card', async () => {
      silenceConsole();
      const { promise, reject } = deferred<Partial<MountConfig>>();
      const onEvent = vi.fn();
      const handle = mount(container, { data: promise, onEvent });

      reject(new Error('endpoint returned 500'));
      await settle();

      expect(handle?.state).toBe('none');
      expect(container.children).toHaveLength(0);
      expect(onEvent).toHaveBeenCalledWith('error', { reason: 'endpoint returned 500' });
    });

    it('emits error when the payload is not config-shaped', async () => {
      silenceConsole();
      const { promise, resolve } = deferred<Partial<MountConfig>>();
      const onEvent = vi.fn();
      const handle = mount(container, { data: promise, onEvent });

      resolve('a JSON string the partner forgot to parse' as never);
      await settle();

      expect(handle?.state).toBe('invalid');
      expect(container.children).toHaveLength(0);
      expect(onEvent).toHaveBeenCalledWith('error', expect.objectContaining({ reason: expect.stringContaining('object') }));
    });
  });

  describe('the skeleton opt-in', () => {
    it('shows the skeleton immediately with state mounting beside data', () => {
      const { promise } = deferred<Partial<MountConfig>>();
      const handle = mount(container, { data: promise, state: 'mounting' });

      expect(handle?.state).toBe('mounting');
      expect(container.children).toHaveLength(1);
      const root = shadow.roots[shadow.roots.length - 1];
      expect(root?.querySelector('.skeleton')).not.toBeNull();
    });

    it('replaces the skeleton with the card on resolve', async () => {
      const { promise, resolve } = deferred<Partial<MountConfig>>();
      mount(container, { data: promise, state: 'mounting' });

      resolve(validConfig());
      await settle();

      expect(container.children).toHaveLength(1);
      const root = shadow.roots[shadow.roots.length - 1];
      expect(root?.querySelector('.skeleton')).toBeNull();
      expect(root?.querySelector('.amount__figure')?.textContent?.trim()).toBe('$40,000');
    });

    it('collapses the skeleton when the payload has no amount', async () => {
      const { promise, resolve } = deferred<Partial<MountConfig>>();
      const onEvent = vi.fn();
      const handle = mount(container, { data: promise, state: 'mounting', onEvent });
      expect(container.children).toHaveLength(1);

      resolve({ amount: null });
      await settle();

      expect(handle?.state).toBe('none');
      expect(container.children).toHaveLength(0);
      expect(onEvent).toHaveBeenCalledWith('skip', { reason: 'no-amount' });
    });
  });

  describe('staleness guards', () => {
    it('ignores a settlement that arrives after unmount()', async () => {
      const { promise, resolve } = deferred<Partial<MountConfig>>();
      const onEvent = vi.fn();
      const handle = mount(container, { data: promise, onEvent });

      handle?.unmount();
      resolve(validConfig());
      await settle();

      expect(handle?.state).toBe('none');
      expect(container.children).toHaveLength(0);
      expect(onEvent).not.toHaveBeenCalled();
    });

    it('ignores a rejection that arrives after unmount()', async () => {
      const { promise, reject } = deferred<Partial<MountConfig>>();
      const onEvent = vi.fn();
      const handle = mount(container, { data: promise, onEvent });

      handle?.unmount();
      reject(new Error('too late to matter'));
      await settle();

      expect(onEvent).not.toHaveBeenCalledWith('error', expect.anything());
    });

    it('lets a manual update() supersede the promise, discarding its later settlement', async () => {
      const { promise, resolve } = deferred<Partial<MountConfig>>();
      const onEvent = vi.fn();
      const handle = mount(container, { data: promise, onEvent });

      handle?.update(validConfig({ amount: 25000 }));
      resolve(validConfig({ amount: 99000 }));
      await settle();

      expect(handle?.state).toBe('prequalified');
      const root = shadow.roots[shadow.roots.length - 1];
      expect(root?.querySelector('.amount__figure')?.textContent?.trim()).toBe('$25,000');
      expect(onEvent).not.toHaveBeenCalledWith('view', expect.objectContaining({ amount: 99000 }));
    });

    it('refuses a data key passed to update(), loudly', () => {
      silenceConsole();
      const handle = mount(container, validConfig());
      const onEvent = vi.fn();

      const result = handle?.update({ data: Promise.resolve({}), onEvent });

      expect(result).toBe('invalid');
      expect(onEvent).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ reason: expect.stringContaining('data is only accepted at mount()') }),
      );
    });
  });

  describe('misbehaving thenables', () => {
    it('treats a thenable whose then() throws synchronously like a rejection', () => {
      silenceConsole();
      const onEvent = vi.fn();
      const thenable = {
        then(): never {
          throw new Error('then blew up');
        },
      };

      const handle = mount(container, { data: thenable as never, onEvent });

      expect(handle).not.toBeNull();
      expect(handle?.state).toBe('none');
      expect(container.children).toHaveLength(0);
      expect(onEvent).toHaveBeenCalledWith('error', { reason: 'then blew up' });
    });

    it('spends the settlement on the first call, so a thenable resolving twice renders once', async () => {
      const onEvent = vi.fn();
      let fulfilTwice!: (payload: Partial<MountConfig>) => void;
      const thenable = {
        then(onFulfilled: (payload: Partial<MountConfig>) => void) {
          fulfilTwice = (payload) => {
            onFulfilled(payload);
            onFulfilled(payload);
          };
        },
      };

      const handle = mount(container, { data: thenable as never, onEvent });
      fulfilTwice(validConfig());
      await settle();

      expect(handle?.state).toBe('prequalified');
      expect(onEvent.mock.calls.filter(([name]) => name === 'view')).toHaveLength(1);
    });
  });
});
