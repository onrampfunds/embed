# Promise-accepting `data` option for `mount()`

**Date:** 2026-08-10
**Status:** Approved design, pre-implementation
**Branch:** `twmills/lazy-load`

## Problem

Integrating the card feels clunkier than it should. Two named frictions:

1. **The inline-JSON handoff.** The server-rendered path requires serialising the
   prequalification into a `<script type="application/json">` block with three escaping rules —
   the step INTEGRATING.md itself calls "the step that goes wrong."
2. **The two-halves wiring.** The partner builds a backend piece and a frontend piece and must
   connect them by hand.

The two-halves *shape* is irreducible: the merchant's sales data and the Onramp credential both
live server-side, so some backend piece must exist. What this design removes is the friction of
the **connection** between the halves.

## Rejected alternative: endpoint-URL option

A `mount()` option taking a partner endpoint URL, with the widget fetching it and showing a
spinner, was considered and rejected. It breaks the library's central guarantee — zero network
requests, asserted in CI — and with it the no-CORS, no-`connect-src`, nothing-to-secure story.
It also inherits every partner's dashboard auth scheme (cookies, CSRF, bearer headers), forcing
endless fetch-config API surface. All that to save one line over the design below, while the hard
half (the server pass-through) remains the partner's job either way.

## Design

### API surface

`MountConfig` gains one key:

```ts
/** The prequalification response, still in flight. Resolves to the payload `mount()` accepts. */
data?: Promise<Partial<MountConfig>>;
```

Usage — the whole frontend half of an integration:

```js
Onramp.mount('#capital', {
  data: fetch('/api/onramp-prequal').then(r => r.json()),
  theme: { accent: '#5B21B6' },
  onEvent: (name, meta) => analytics.track(`onramp:${name}`, meta),
});
```

Rules:

- **Page-side keys apply immediately.** `onEvent`, `theme`, `state`, `locale`, `partnerName`
  beside `data` take effect at mount time — so an opted-in skeleton is themed from its first
  frame.
- **The payload owns the data-bearing fields.** `amount`, `currency`, `applyUrl`, `lexicon`, and
  `copy` come exclusively from the resolved payload. Passing any of them inline beside `data` is
  invalid config — one source of truth per mount, and mount-time code must never be able to
  override regulated copy. Handled like any other malformed config: log, render nothing, emit
  `error`.
- **Merge on resolve.** Page-side keys and payload fields are disjoint by the rules above, so
  the merge is mechanical. The one shared key is `theme`, which keeps its existing per-token
  rule: mount-passed tokens override stored (payload) tokens.
- **`state` inside the payload is ignored.** Pending presentation is a page-side concern.
- **No timeout, retry, or abort options.** The partner creates the promise, so the partner owns
  cancellation and deadlines. The widget just awaits.

Raw attrs remain the primitive. `data` is strictly additive sugar over the existing
`mount()` → `update()` machinery; passing a plain config keeps working unchanged and stays
first-class in the docs.

### Lifecycle

- **`mount()` with valid `data` config returns a handle, not `null`** — there is nothing to
  decide yet. Synchronously detectable problems (bad target, data-bearing fields beside `data`,
  malformed page-side keys) still return `null` exactly as today. `handle.state` reports `'mounting'` while pending. The `CardState` doc for `'mounting'`
  widens from "skeleton rendered" to "awaiting data, skeleton optional."
- **Default pending presentation is silent.** Nothing renders until the promise settles. A
  merchant with no offer never sees a card-shaped thing appear and dissolve — identical to
  today's server-rendered UX. Chosen because the no-offer rate is unmeasured; silence is safe at
  any rate.
- **Skeleton is opt-in:** `state: 'mounting'` beside `data` shows the existing themed skeleton
  immediately.
- **On resolve,** render through the existing `update()` path:
  - Full payload → the card, `view` event, as today.
  - `amount` of `0`, `null`, or absent → yield the slot silently, emit `skip`
    (`reason: 'no-amount'`), as today. If the skeleton was opted into, it collapses.
- **On rejection,** yield the slot and emit `error` with the rejection reason — mirroring
  malformed-config behaviour. Never an error card.
- **Staleness guards:**
  - A settlement arriving after `unmount()` is ignored.
  - A manual `handle.update()` while pending supersedes the promise; its later settlement is
    discarded.

### React wrapper

`data` flows through `OnrampPrequalificationProps` automatically (props extend `MountConfig`).
`signature.ts` computes value identity, which a promise does not have, so the signature
incorporates `data` by **reference identity**. Docs instruct creating the promise once —
`useState(() => fetch(...))` or `useMemo` — because a fresh promise each render would remount in
a loop.

### Documentation

- **INTEGRATING.md Step 2 flips.** Primary path: expose the prequalification at a
  session-authenticated JSON endpoint on the partner's own origin, pass the fetch to `data`. The
  `<script type="application/json">` block and its three escaping rules move to an appendix for
  SSR partners who want zero extra round-trips.
- **Both package READMEs** lead with the `data` one-liner.
- **Failure guidance is unchanged:** handle failure by rendering the page without the card; the
  `data` path now does that automatically.

### Examples

- Existing examples stand: `plain-html` demos with canned raw attrs and no backend — that path
  is unchanged and remains the way to demo instantly.
- Add a pending-flow demo: a canned payload behind
  `new Promise(r => setTimeout(() => r(canned), 800))` shows skeleton → card with no server.

### Guarantees and tests

Every CI assertion survives unchanged: zero network requests (the partner's code creates the
promise; the library never fetches), zero runtime dependencies, under 40KB gzipped, style
isolation.

New unit tests:

- resolve → card renders, `view` emitted
- resolve with `amount` 0/null → slot yielded, `skip` emitted, opted-in skeleton collapses
- rejection → slot yielded, `error` emitted
- settlement after `unmount()` → ignored, no DOM writes, no events
- manual `update()` while pending → wins; late settlement discarded
- `state: 'mounting'` + `data` → skeleton immediately, themed by mount-time tokens
- any data-bearing field (`amount`, `copy`, …) inline beside `data` → invalid, `error` emitted,
  `null` returned
- React: stable `data` reference does not remount; changed reference does

## Out of scope

- Endpoint-URL fetching by the widget (rejected above).
- Timeouts, retries, abort plumbing.
- Any change to the partner API or the server half of integrations.
