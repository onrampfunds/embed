# Promise-accepting `data` option for `mount()` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mount()` accepts a `data` key holding a promise of the prequalification response; the widget renders (silently by default, skeleton opt-in) when it settles, folding fetch, pending state, and no-offer handling into one call.

**Architecture:** `data` is additive sugar over the existing `mount()` → `update()` machinery. Pure merge/validation logic lives in a new `src/data.ts`; `mount()` in `src/index.ts` gains one pending branch that renders on settle through the existing `render()` closure with staleness guards. The React wrapper keys its signature on the promise's reference identity.

**Tech Stack:** TypeScript, Vitest (unit, files in `packages/*/test/`), React 18 test harness in `packages/embed-react/test/helpers.tsx`. No new dependencies of any kind.

**Spec:** `docs/superpowers/specs/2026-08-10-promise-data-mount-design.md` — read it before starting.

## Global Constraints

- **Zero runtime dependencies, zero network requests by the library, under 40KB gzipped** — all asserted by `npm run verify`. The partner's code creates the promise; the library never fetches.
- **The payload owns the data-bearing fields:** `amount`, `currency`, `applyUrl`, `lexicon`, `copy`. Any of them inline beside `data` is invalid config.
- **Page-side keys beside `data`:** `onEvent`, `theme`, `state`, `locale`, `partnerName` — applied at mount time; on resolve, payload merges under them (theme per-token: mount-passed tokens win).
- **Default pending presentation is silent** (nothing renders). `state: 'mounting'` beside `data` opts into the existing skeleton.
- **Never an error card.** Rejection yields the slot and emits `error`; `amount` 0/null/absent yields the slot and emits `skip` — both via existing behavior.
- **No timeout/retry/abort options.** Out of scope by spec.
- **Docs show both paths as peers** everywhere `mount()` is documented: direct config is the primitive, `data` the optional convenience.
- All commits on branch `twmills/lazy-load`. Run commands from the repo root unless a task says otherwise.

---

### Task 1: Pure helpers — `src/data.ts`, the `data` type, and `normalize()` refusing `data`

**Files:**
- Create: `packages/embed/src/data.ts`
- Create: `packages/embed/test/data.test.ts`
- Modify: `packages/embed/src/types.ts` (add `data` to `MountConfig`, widen the `'mounting'` doc)
- Modify: `packages/embed/src/config.ts` (export `isObject`; `normalize()` refuses a `data` key)
- Modify: `packages/embed/test/config.test.ts` (one new case)

**Interfaces:**
- Consumes: `isObject` from `config.ts` (currently private — this task exports it), `MountConfig` from `types.ts`.
- Produces (Task 2 relies on these exact names):
  - `isThenable(value: unknown): value is PromiseLike<unknown>`
  - `fieldsBesideData(config: MountConfig): string[]` — data-bearing keys illegally present, in declaration order
  - `mergeResolved(pageSide: MountConfig, payload: unknown): MountConfig`
  - `MountConfig` gains `data?: Promise<Partial<MountConfig>> | PromiseLike<Partial<MountConfig>>`
  - `normalize()` returns `{ ok: false, reason: 'data is only accepted at mount(); pass resolved values to update()' }` when raw has a `data` key

- [ ] **Step 1: Write the failing tests**

Create `packages/embed/test/data.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fieldsBesideData, isThenable, mergeResolved } from '../src/data';
import { normalize } from '../src/config';
import { validConfig } from './helpers';

describe('isThenable', () => {
  it('accepts a native promise', () => {
    expect(isThenable(Promise.resolve({}))).toBe(true);
  });

  it('accepts a bare thenable, which is what a cross-realm promise looks like', () => {
    expect(isThenable({ then: () => undefined })).toBe(true);
  });

  it.each([[null], [undefined], [42], ['pending'], [{}], [{ then: 'soon' }]])(
    'refuses %j',
    (value) => {
      expect(isThenable(value)).toBe(false);
    },
  );
});

describe('fieldsBesideData', () => {
  it('is empty for page-side keys', () => {
    expect(
      fieldsBesideData({ data: Promise.resolve({}), theme: { accent: '#000' }, state: 'mounting' }),
    ).toEqual([]);
  });

  it('names every data-bearing field passed inline', () => {
    expect(
      fieldsBesideData({ data: Promise.resolve({}), amount: 40000, copy: { qualifier: 'x' } }),
    ).toEqual(['amount', 'copy']);
  });

  it('counts an explicit undefined as absent, matching how mount() treats every option', () => {
    expect(fieldsBesideData({ data: Promise.resolve({}), amount: undefined })).toEqual([]);
  });
});

describe('mergeResolved', () => {
  const onEvent = (): void => undefined;

  it('starts from the payload and overlays the page-side keys', () => {
    const merged = mergeResolved(
      { onEvent, locale: 'en-GB', partnerName: 'Cartwheel' },
      validConfig(),
    );
    expect(merged.amount).toBe(40000);
    expect(merged.applyUrl).toBe('https://onrampfunds.com/p/abc123');
    expect(merged.onEvent).toBe(onEvent);
    expect(merged.locale).toBe('en-GB');
    expect(merged.partnerName).toBe('Cartwheel');
  });

  it('merges theme per token, mount-passed tokens winning', () => {
    const merged = mergeResolved(
      { theme: { accent: '#5B21B6' } },
      validConfig({ theme: { accent: '#111111', radius: 12 } }),
    );
    expect(merged.theme).toEqual({ accent: '#5B21B6', radius: 12 });
  });

  it('drops state and data from the payload — pending presentation is a page-side concern', () => {
    const merged = mergeResolved({}, { ...validConfig(), state: 'mounting', data: Promise.resolve({}) });
    expect(merged.state).toBeUndefined();
    expect(merged.data).toBeUndefined();
  });

  it('never carries the page-side pending state past the resolve', () => {
    const merged = mergeResolved({ state: 'mounting' }, validConfig());
    expect(merged.state).toBeUndefined();
  });

  it('passes a non-object payload through untouched, so normalize() explains it', () => {
    expect(mergeResolved({}, 'nope')).toBe('nope');
  });
});

describe('normalize with a data key', () => {
  it('refuses it — data is only accepted at mount()', () => {
    const result = normalize({ ...validConfig(), data: Promise.resolve({}) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('data is only accepted at mount()');
  });
});
```

Add to the invalid-config describe block in `packages/embed/test/config.test.ts` (match the file's existing style for asserting `ok: false`):

```ts
it('refuses a data key — data is only accepted at mount()', () => {
  const result = normalize({ data: Promise.resolve({}) });
  expect(result.ok).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace @onrampfunds/embed -- data`
Expected: FAIL — `Cannot find module '../src/data'` (and the config case fails because `normalize` accepts the key).

- [ ] **Step 3: Implement**

Add to `packages/embed/src/types.ts`, inside `MountConfig` after the `state` field (keep the existing comment style):

```ts
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
```

In the same file, widen the `CardState` doc line for `'mounting'` from `` `mounting` — the partner is still fetching. Static blocks, no spinner. `` to:

```ts
 * - `mounting` — awaiting data: either the partner is still fetching, or a `data` promise is
 *   pending. Shows the static-block skeleton when asked to; a pending `data` mount shows
 *   nothing by default.
```

In `packages/embed/src/config.ts`: change `function isObject` to `export function isObject`, and add at the top of `normalize()`, immediately after the `isObject(raw)` guard:

```ts
  // `data` is mount()'s to unwrap. By the time a config reaches normalize() — update(), or the
  // merged payload after a resolve — a data key means the partner passed the promise somewhere
  // it cannot be awaited, which deserves a loud refusal rather than a silent 'none'.
  if ((raw as MountConfig).data !== undefined) {
    return { ok: false, reason: 'data is only accepted at mount(); pass resolved values to update()' };
  }
```

Create `packages/embed/src/data.ts`:

```ts
import { isObject } from './config';
import type { MountConfig } from './types';

/**
 * The fields the resolved payload owns exclusively. Everything the server decides — the amount,
 * where applying goes, which vocabulary is compliant, the regulated copy — has exactly one
 * source of truth per mount, and mount-time code must never be able to override regulated copy.
 */
const PAYLOAD_FIELDS = ['amount', 'currency', 'applyUrl', 'lexicon', 'copy'] as const;

/**
 * The thenable duck-type rather than `instanceof Promise`, for the same reason `isObject` avoids
 * prototype checks: a promise from another realm — a micro-frontend handing config across an
 * iframe boundary — is legitimate and fails `instanceof`.
 */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  return typeof (value as PromiseLike<unknown>).then === 'function';
}

/** Data-bearing keys illegally passed beside `data`, in declaration order, for the log line. */
export function fieldsBesideData(config: MountConfig): string[] {
  return PAYLOAD_FIELDS.filter((field) => config[field] !== undefined);
}

/**
 * Folds the settled payload under the mount-time page-side keys.
 *
 * The two sides are disjoint by construction — `fieldsBesideData` refused any overlap at mount —
 * so the merge is mechanical. The one shared key is `theme`, which keeps its existing per-token
 * rule: mount-passed tokens override stored (payload) tokens. `state` and `data` never survive
 * the merge: pending presentation is a page-side concern, and the pending promise is spent.
 *
 * A payload that is not config-shaped passes through untouched so `normalize()` refuses it with
 * its usual message — the partner hears "config must be an object", not a mystery.
 */
export function mergeResolved(pageSide: MountConfig, payload: unknown): MountConfig {
  if (!isObject(payload)) return payload as MountConfig;

  const served = payload as MountConfig;
  const merged: MountConfig = { ...served };
  delete merged.state;
  delete merged.data;

  if (pageSide.onEvent !== undefined) merged.onEvent = pageSide.onEvent;
  if (pageSide.locale !== undefined) merged.locale = pageSide.locale;
  if (pageSide.partnerName !== undefined) merged.partnerName = pageSide.partnerName;
  if (served.theme !== undefined || pageSide.theme !== undefined) {
    merged.theme = { ...served.theme, ...pageSide.theme };
  }
  return merged;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace @onrampfunds/embed -- data config`
Expected: PASS, including the whole pre-existing `config.test.ts` suite.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck --workspace @onrampfunds/embed
git add packages/embed/src/data.ts packages/embed/src/types.ts packages/embed/src/config.ts packages/embed/test/data.test.ts packages/embed/test/config.test.ts
git commit -m "Add the data option's type and pure merge/validation helpers"
```

---

### Task 2: The pending branch in `mount()` — validation, silent pending, resolve-to-card

**Files:**
- Modify: `packages/embed/src/index.ts:102-231` (the `mount()` function)
- Create: `packages/embed/test/pending.test.ts`

**Interfaces:**
- Consumes: `isThenable`, `fieldsBesideData`, `mergeResolved` from `./data` (Task 1); the existing `render`, `teardown`, `emitter`, `clearPrevious`, `fail` in `index.ts`.
- Produces: `mount()` with a `data` config returns a `MountHandle` (never `null` for valid config) whose `state` is `'mounting'` while pending; Tasks 3–4 extend `pending.test.ts` and rely on its helpers (`settle`, `deferred`) exactly as defined here.

- [ ] **Step 1: Write the failing tests**

Create `packages/embed/test/pending.test.ts`:

```ts
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
      const quiet = silenceConsole();
      const onEvent = vi.fn();
      const handle = mount(container, { data: 'soon' as never, onEvent });
      expect(handle).toBeNull();
      expect(onEvent).toHaveBeenCalledWith('error', expect.objectContaining({ reason: expect.any(String) }));
      quiet.restore();
    });

    it('refuses data-bearing fields beside data, naming them', () => {
      const quiet = silenceConsole();
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
      quiet.restore();
    });

    it('refuses a bad state value beside data', () => {
      const quiet = silenceConsole();
      const handle = mount(container, { data: Promise.resolve({}), state: 'loading' as never });
      expect(handle).toBeNull();
      quiet.restore();
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

      const host = container.firstElementChild as HTMLElement;
      // resolveTheme() writes the tokens as custom properties on the card's style host.
      expect(host.outerHTML).not.toContain('#111111');
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
```

Note on the theme assertion: check how `attachStyles`/`resolveTheme` expose tokens (see `packages/embed/src/render.ts` and `src/theme.ts`) and assert the way `theme.test.ts` does — the intent is: resolved card carries `#5B21B6`, not `#111111`. Adjust the selector to match the mechanism the existing theme tests use; do not weaken the assertion to "a card rendered".

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace @onrampfunds/embed -- pending`
Expected: FAIL — the refusal tests get a handle back (mount treats `data` as an unknown key today: `normalize` now refuses it, so plain mounts return null with the *wrong* reason), and the pending tests find `handle === null`.

- [ ] **Step 3: Implement the pending branch**

In `packages/embed/src/index.ts`: import from `./data`:

```ts
import { fieldsBesideData, isThenable, mergeResolved } from './data';
```

Inside `mount()`, insert the branch after the `render` closure is defined and **replace** the current tail (`state = render(config); if (state === 'none' ...) return null; return {...}`) with:

```ts
  if (config !== null && typeof config === 'object' && config.data !== undefined) {
    // Read once into a local: the isThenable guard narrows `data` itself, which a destructured
    // alias of `config.data` would not inherit.
    const data = config.data;
    const emit = emitter(config);
    const refuse = (reason: string): null => {
      fail(`${reason}. Nothing was rendered.`);
      emit('error', { reason });
      return null;
    };

    if (!isThenable(data)) {
      return refuse('data must be a promise of the prequalification response');
    }
    const beside = fieldsBesideData(config);
    if (beside.length > 0) {
      return refuse(
        `${beside.join(', ')} must come from the resolved data payload, not beside it`,
      );
    }
    if (config.state !== undefined && config.state !== null && config.state !== 'auto' && config.state !== 'mounting') {
      return refuse(`state must be 'auto' or 'mounting', got ${JSON.stringify(config.state)}`);
    }

    const { data: _spent, ...pageSide } = config;

    // False once the partner has taken over — by update() or unmount() — after which whatever
    // the promise does is no longer this mount's business.
    let live = true;

    if (pageSide.state === 'mounting') {
      state = render(pageSide);
    } else {
      // Silent pending: no host, no skeleton, no events. A merchant with no offer never sees
      // a card-shaped thing appear and dissolve.
      state = 'mounting';
    }

    data.then(
      (payload) => {
        if (!live) return;
        state = render(mergeResolved(pageSide, payload));
      },
      (cause: unknown) => {
        if (!live) return;
        teardown();
        clearPrevious(container);
        state = 'none';
        emit('error', { reason: cause instanceof Error ? cause.message : String(cause) });
      },
    );

    return {
      get state(): CardState {
        return state;
      },
      update(next: MountConfig): CardState {
        live = false;
        state = render(next);
        return state;
      },
      unmount(): void {
        live = false;
        teardown();
        state = 'none';
      },
    };
  }

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
```

Also update the `mount()` JSDoc `@returns` line to:

```ts
 * @returns a handle, or `null` when nothing was rendered — because there is no amount, or the
 * configuration was malformed. With a `data` promise, valid config always returns a handle:
 * there is nothing to decide until the promise settles. A `null` return is the partner's cue to
 * render their own fallback into the slot; it never means the merchant was rejected.
```

- [ ] **Step 4: Run the full unit suite to verify everything passes**

Run: `npm test --workspace @onrampfunds/embed`
Expected: PASS — `pending.test.ts` and every pre-existing test (`mount.test.ts` proves the plain path is untouched).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck --workspace @onrampfunds/embed
git add packages/embed/src/index.ts packages/embed/test/pending.test.ts
git commit -m "Accept a data promise in mount(): validate, hold silently, render on resolve"
```

---

### Task 3: Settle outcomes — no-offer collapse, rejection, skeleton opt-in

**Files:**
- Modify: `packages/embed/test/pending.test.ts` (extend)
- Modify: `packages/embed/src/index.ts` (only if a test exposes a gap — Task 2's branch is expected to already satisfy these)

**Interfaces:**
- Consumes: `settle`, `deferred`, and the setup from Task 2's `pending.test.ts`, plus `silenceConsole`, `validConfig` from `./helpers`.
- Produces: locked-in observable behavior for every settle outcome; no new exports.

- [ ] **Step 1: Write the tests**

Append inside the `describe('mount with data')` block:

```ts
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
      const quiet = silenceConsole();
      const { promise, reject } = deferred<Partial<MountConfig>>();
      const onEvent = vi.fn();
      const handle = mount(container, { data: promise, onEvent });

      reject(new Error('endpoint returned 500'));
      await settle();

      expect(handle?.state).toBe('none');
      expect(container.children).toHaveLength(0);
      expect(onEvent).toHaveBeenCalledWith('error', { reason: 'endpoint returned 500' });
      quiet.restore();
    });

    it('emits error when the payload is not config-shaped', async () => {
      const quiet = silenceConsole();
      const { promise, resolve } = deferred<Partial<MountConfig>>();
      const onEvent = vi.fn();
      const handle = mount(container, { data: promise, onEvent });

      resolve('a JSON string the partner forgot to parse' as never);
      await settle();

      expect(handle?.state).toBe('invalid');
      expect(container.children).toHaveLength(0);
      expect(onEvent).toHaveBeenCalledWith('error', expect.objectContaining({ reason: expect.stringContaining('object') }));
      quiet.restore();
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
```

- [ ] **Step 2: Run the tests**

Run: `npm test --workspace @onrampfunds/embed -- pending`
Expected: PASS if Task 2's branch is complete. Any failure here is a real gap — fix it in `src/index.ts` (not by weakening the test), then re-run.

- [ ] **Step 3: Commit**

```bash
git add packages/embed/test/pending.test.ts packages/embed/src/index.ts
git commit -m "Pin every settle outcome: no-offer collapse, rejection, skeleton opt-in"
```

---

### Task 4: Staleness guards — unmount and update beat a late settlement

**Files:**
- Modify: `packages/embed/test/pending.test.ts` (extend)
- Modify: `packages/embed/src/index.ts` (only if a test exposes a gap)

**Interfaces:**
- Consumes: same test scaffolding as Tasks 2–3.
- Produces: locked-in guard behavior; no new exports.

- [ ] **Step 1: Write the tests**

Append inside `describe('mount with data')`:

```ts
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
      const quiet = silenceConsole();
      const handle = mount(container, validConfig());
      const onEvent = vi.fn();

      const result = handle?.update({ data: Promise.resolve({}), onEvent });

      expect(result).toBe('invalid');
      expect(onEvent).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ reason: expect.stringContaining('data is only accepted at mount()') }),
      );
      quiet.restore();
    });
  });
```

- [ ] **Step 2: Run the tests**

Run: `npm test --workspace @onrampfunds/embed -- pending`
Expected: PASS if Task 2's `live` flag and Task 1's `normalize` refusal are complete. Fix any gap in `src/index.ts`, then re-run.

- [ ] **Step 3: Run the whole workspace suite and commit**

Run: `npm test --workspace @onrampfunds/embed` — expected PASS.

```bash
git add packages/embed/test/pending.test.ts packages/embed/src/index.ts
git commit -m "Guard the data promise against late settlements after unmount or update"
```

---

### Task 5: React wrapper — `data` by reference identity

**Files:**
- Modify: `packages/embed-react/src/signature.ts` (add `referenceId`)
- Modify: `packages/embed-react/src/component.tsx`
- Modify: `packages/embed-react/test/wrapper.test.tsx`

**Interfaces:**
- Consumes: `data` on `MountConfig` (Task 1) — the wrapper's props already extend it; `mount()` pending behavior (Task 2).
- Produces: `referenceId(value: object): number` in `signature.ts`; `OnrampPrequalification` accepting a `data` prop that remounts only when its reference changes.

- [ ] **Step 1: Write the failing tests**

Add to `packages/embed-react/test/wrapper.test.tsx`, following the file's harness conventions (see the existing `re-rendering` describe block):

```tsx
  describe('the data prop', () => {
    it('holds silently, then renders the card when the promise resolves', async () => {
      let resolve!: (value: Partial<MountConfig>) => void;
      const data = new Promise<Partial<MountConfig>>((res) => {
        resolve = res;
      });

      harness = mountHarness();
      harness.render(<OnrampPrequalification data={data} />);
      expect(harness.hosts()).toHaveLength(0);

      await act(async () => {
        resolve(validConfig());
        await Promise.resolve();
      });

      expect(harness.hosts()).toHaveLength(1);
      expect(harness.text('.amount__figure')).toBe('$40,000');
      harness.unmount();
    });

    it('does not remount when the same promise reference re-renders', async () => {
      const data = Promise.resolve(validConfig());

      harness = mountHarness();
      harness.render(<OnrampPrequalification data={data} />);
      await act(async () => {
        await Promise.resolve();
      });
      const rootsAfterFirst = shadow.roots.length;

      harness.render(<OnrampPrequalification data={data} />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(shadow.roots.length).toBe(rootsAfterFirst);
      harness.unmount();
    });

    it('remounts when the promise reference changes', async () => {
      harness = mountHarness();
      harness.render(<OnrampPrequalification data={Promise.resolve(validConfig())} />);
      await act(async () => {
        await Promise.resolve();
      });
      const rootsAfterFirst = shadow.roots.length;

      harness.render(<OnrampPrequalification data={Promise.resolve(validConfig({ amount: 25000 }))} />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(shadow.roots.length).toBeGreaterThan(rootsAfterFirst);
      expect(harness.text('.amount__figure')).toBe('$25,000');
      harness.unmount();
    });
  });
```

Import `act` and `MountConfig` at the top of the file if not already imported (the harness re-exports `act` usage patterns — match how the existing tests wrap renders; `validConfig` and `mountHarness` come from `./helpers`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test --workspace @onrampfunds/embed-react`
Expected: the same-reference test FAILS — `signatureOf` normalises any promise to `{}`, so today a *changed* promise reference does **not** remount (all promises look identical), and the changed-reference test fails on `$25,000` never appearing.

- [ ] **Step 3: Implement**

Add to `packages/embed-react/src/signature.ts`:

```ts
let nextReferenceId = 1;
const referenceIds = new WeakMap<object, number>();

/**
 * A stable id for values that only have reference identity. A promise has no serialisable value —
 * `normalise` would fold every promise to `{}`, making all of them look like the same config — so
 * the signature carries this id instead: same promise, same signature; new promise, new mount.
 */
export function referenceId(value: object): number {
  let id = referenceIds.get(value);
  if (id === undefined) {
    id = nextReferenceId;
    nextReferenceId += 1;
    referenceIds.set(value, id);
  }
  return id;
}
```

In `packages/embed-react/src/component.tsx`:

```tsx
import { referenceId, signatureOf } from './signature';
```

Destructure `data` out of the props alongside the existing extractions:

```tsx
  const { className, style, onEvent, data, ...config } = props;
```

Replace the signature line:

```tsx
  // Value identity for everything serialisable; reference identity for the promise, which has no
  // value until it settles — and when it settles, the core repaints in place without a remount.
  const signature =
    data !== null && typeof data === 'object'
      ? `${signatureOf(config)}|data:${referenceId(data)}`
      : signatureOf(config);
```

And pass `data` through in the mount call:

```tsx
    card.current = mount(element, {
      ...(config as MountConfig),
      ...(data !== undefined ? { data } : {}),
      onEvent: (name, meta) => {
        latestOnEvent.current?.(name, meta);
      },
    });
```

Also update the component's JSDoc example block to show both forms (this is the doc-comment partners see in their editor):

```tsx
 * ```tsx
 * // Direct data — you already fetched the prequalification:
 * <OnrampPrequalification {...prequalification} onEvent={track} />
 *
 * // Or hand it the fetch itself — create the promise once, not per render:
 * const [data] = useState(() => fetch('/api/onramp-prequal').then((r) => r.json()));
 * <OnrampPrequalification data={data} onEvent={track} />
 * ```
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test --workspace @onrampfunds/embed-react`
Expected: PASS, including all pre-existing wrapper tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck --workspace @onrampfunds/embed-react
git add packages/embed-react/src/signature.ts packages/embed-react/src/component.tsx packages/embed-react/test/wrapper.test.tsx
git commit -m "Carry the data promise through the React wrapper by reference identity"
```

---

### Task 6: Documentation and examples — both paths as peers

**Files:**
- Modify: `README.md` (root, the "Use" section)
- Modify: `INTEGRATING.md` (Step 2)
- Modify: `packages/embed/README.md` (the mount/API documentation — read it first; add `data` beside the existing config docs)
- Modify: `packages/embed-react/README.md` (same)
- Modify: `examples/plain-html/index.html` (add a pending-flow demo)

No test cycle — this task is prose and a demo page. The gate is the checklist in Step 3.

- [ ] **Step 1: Update the four documents**

Follow each file's existing voice (short declarative sentences, bold key phrases, reasons attached to rules). **Fence warning:** the nested ` ```js ` fences in the blocks below are prefixed with a zero-width space so they survive inside this plan document — strip that invisible character when copying, or retype the fences. The required content, to adapt into each file's structure:

Root `README.md` — in the "Use" section, after the existing forward-the-response example, add:

```markdown
If your page fetches the prequalification from your backend itself, you can hand `mount()` the
fetch instead and let it handle the waiting:

​```js
Onramp.mount('#capital', {
  data: fetch('/api/onramp-prequal').then((r) => r.json()),
  onEvent: (name, meta) => analytics.track(`onramp:${name}`, meta),
});
​```

Nothing renders until the promise settles — then the card, or nothing at all for a merchant with
no offer, exactly as if you had passed the values directly. Add `state: 'mounting'` to show a
themed skeleton while it waits. The library still makes no network requests of its own: your
code creates the promise, so your session auth just works. Both forms are equal citizens —
direct config is the primitive, `data` is a convenience over it.
```

`INTEGRATING.md` Step 2 — restructure "Step 2 — Server: get it into the page" to present **two peer connections**, each labelled with when to prefer it:

```markdown
## Step 2 — Connect the halves

The response is JSON that has to reach the widget. Two ways, both first-class — pick by how your
dashboard renders:

**(a) Direct data.** You already have the response where the page is built. Server-rendered
pages serialise it into a `<script type="application/json">` block (escaping rules below —
they are not optional). Client code that has already fetched just spreads it into `mount()`.

**(b) A `data` promise.** Your page fetches from your own backend. Expose the response at a
session-authenticated JSON endpoint on your origin and hand `mount()` the fetch:

​```js
Onramp.mount('#capital', {
  data: fetch('/api/onramp-prequal').then((r) => r.json()),
  onEvent: (name, meta) => analytics.track(`onramp:${name}`, meta),
});
​```

This folds the fetch, the pending state, and the no-offer case into one call: nothing renders
until the promise settles, a merchant with no offer sees nothing appear, and a rejected promise
yields the slot and reports an `error` event — the "render the page without the card" rule,
automated. Add `state: 'mounting'` beside `data` to show a themed skeleton while it waits.
`amount`, `currency`, `applyUrl`, `lexicon`, and `copy` must come from the resolved payload,
never inline beside `data`.
```

Keep the existing escaping-rules content intact under path (a) — it still applies fully to the inline-JSON mechanism. Do not delete or soften it.

`packages/embed/README.md` — read the file, find where `mount()` options are documented, and add `data` to the option documentation using the JSDoc text from Task 1 as the source of truth, plus the two-forms example (direct config and `data`) side by side near the top usage example.

`packages/embed-react/README.md` — read the file and add the `data` prop with the create-the-promise-once rule stated as a requirement, showing both forms:

```markdown
Pass `data` to let the card await your fetch. **Create the promise once** — `useState(() =>
fetch(...))` or `useMemo` — a fresh promise on every render remounts the card in a loop, because
a promise has only reference identity.
```

- [ ] **Step 2: Add the pending-flow demo to `examples/plain-html/index.html`**

Read the file first; it has a control strip of `data-state` buttons and a canned `base` config. Add one button (`Simulated fetch`) whose handler demos the promise path with no server, following the file's existing code style:

```js
// The data path, demoed with canned values behind a delay: skeleton, then the card —
// or pass { amount: null } to watch the no-offer case yield the slot instead.
Onramp.mount('#capital', {
  state: 'mounting',
  data: new Promise((resolve) => setTimeout(() => resolve(base), 800)),
  onEvent: log,
});
```

Wire it consistently with how the existing buttons re-mount (reuse their teardown/re-mount mechanics and their `onEvent` logger; the names `base` and `log` above must be adapted to the file's actual identifiers).

- [ ] **Step 3: Verify the docs against this checklist**

- [ ] Every file that shows a `mount()`/component example shows **both** forms, direct config first.
- [ ] No document calls the `data` path "the new way", "recommended", or "primary" — they are peers.
- [ ] The escaping rules in INTEGRATING.md survive, attached to the inline-JSON path.
- [ ] The payload-owns-fields rule (`amount`, `currency`, `applyUrl`, `lexicon`, `copy`) appears in INTEGRATING.md and `packages/embed/README.md`.
- [ ] The React create-the-promise-once rule appears in `packages/embed-react/README.md`.
- [ ] Open `examples/plain-html/index.html` in a browser (`npx serve examples/plain-html` or the repo's documented example command) and click the new button: skeleton for ~800ms, then the card.

- [ ] **Step 4: Commit**

```bash
git add README.md INTEGRATING.md packages/embed/README.md packages/embed-react/README.md examples/plain-html/index.html
git commit -m "Document the data promise beside direct config as peer mount paths"
```

---

### Task 7: Full verification

**Files:** none modified — this task gates the branch.

- [ ] **Step 1: Run the repo's full verify pipeline**

Run: `npm run verify`
Expected: PASS end to end — build, typecheck, every unit test, lockstep versions, **zero dependencies, bundle size under 40KB, zero network calls in the bundle**, tarball checks. The three bolded checks are the spec's guarantees; if any fails, the implementation broke a constraint — fix the code, never the check.

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS (Playwright, against the built bundle).

- [ ] **Step 3: Changeset**

The repo releases via Changesets (see `RELEASING.md`). Add one:

```bash
npx changeset
```

Minor bump for both `@onrampfunds/embed` and `@onrampfunds/embed-react` (a new public API, backwards-compatible), with the summary:

```
Accept a `data` promise in `mount()` and as a React prop: the card waits for your fetch and
renders on settle — silently by default, with the themed skeleton via `state: 'mounting'`.
Direct config is unchanged and remains the primitive.
```

Commit the changeset file:

```bash
git add .changeset/
git commit -m "Add changeset for the data promise option"
```

- [ ] **Step 4: Report**

State plainly what passed (verify + e2e output), and that the branch is ready for PR.
