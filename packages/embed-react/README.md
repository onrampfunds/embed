# @onrampfunds/embed-react

React wrapper for [`@onrampfunds/embed`](https://github.com/onrampfunds/embed/tree/main/packages/embed).

```sh
npm install @onrampfunds/embed-react
```

React is a peer dependency. The core library comes with it, pinned to an exact matching version —
you never have to reason about which wrapper pairs with which core.

## Use

```tsx
import { OnrampPrequalification } from '@onrampfunds/embed-react';

export function CapitalPanel({ prequalification }) {
  return (
    <OnrampPrequalification
      {...prequalification}
      onEvent={(name, meta) => analytics.track(`onramp:${name}`, meta)}
    />
  );
}
```

Every prop except `className` and `style` **is** the core's mount config, so
[that package's README](../embed/README.md) is the contract for amounts, copy, theme tokens,
states, and events. In practice you spread the prequalification response straight in, exactly as
above.

## What the wrapper actually does

It is a ref and an effect. The core owns everything that carries weight — the closed shadow root,
the state machine, the contrast guard, the regulated copy contract — and none of that is
reimplemented here. What this package handles is reconciling an imperative mount against React's
lifecycle, which has two failure modes worth naming.

**An inline callback does not remount the card.** This is the one that bites people:

```tsx
<OnrampPrequalification {...config} onEvent={(name, meta) => track(name, meta)} />
```

That arrow function is a new value on every parent render. Keying the mount effect on props
directly would tear down the shadow root and rebuild it every time anything in the parent changed
— a visible flicker on a surface that is supposed to sit quietly in someone else's dashboard.

So the effect is keyed on a **value-based signature** of the config rather than its reference, and
callbacks are read through a ref at call time. Two objects describing the same card leave it in
place, including when only key order differs. The card always invokes your latest handler, not the
one captured at mount.

**Strict mode does not produce two cards.** React double-invokes effects in development; the
cleanup unmounts properly, so you end with exactly one shadow root.

A config change that genuinely differs — a new amount, a new expiry — does remount, which is the
correct behaviour and what the core's own `update()` would do anyway.

## States

The card renders nothing when there is no amount, and nothing when the config is malformed
(the reason is logged). Both leave an empty element behind and neither throws into your tree. That
is deliberate: a merchant who does not qualify this month must never see something that reads as a
rejection.

## If you need the imperative API

The wrapper is a convenience, not a requirement. `mount()` from the core is a `ref` and a
`useEffect` if you would rather own the lifecycle yourself — the same two problems above are then
yours to solve.

## License

[MIT](LICENSE).

**Trademark.** The MIT licence covers the code. It does not grant any right to use the Onramp Funds
name, logo, or other trademarks, or to access the Onramp Funds API or services.
