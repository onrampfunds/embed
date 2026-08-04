# @onrampfunds/embed

Renders a merchant's Onramp Funds prequalification inside your own page, in a closed shadow root.

**Zero dependencies. Zero network calls.** Your backend fetches the prequalification server-side
and passes it in; the library renders what it is handed and nothing else. There is no token to
mint, no CORS to negotiate, no third-party cookie, and no iframe.

```sh
npm install @onrampfunds/embed
```

```js
import { mount } from '@onrampfunds/embed';

mount('#capital', {
  amount: 40000,
  currency: 'USD',
  // Onramp-set, and illustrative here. Once it passes, the card renders its expired state.
  validUntil: '2030-01-01T00:00:00Z',
  applyUrl: 'https://onrampfunds.com/p/abc123...',
  lexicon: 'loan',
  copy: {
    /* served strings — see "Copy" below */
  },
  theme: { accent: '#5B21B6', radius: 8, font: 'system' },
  onEvent: (name, meta) => analytics.track(`onramp:${name}`, meta),
});
```

Via a script tag, the same call is available as `Onramp.mount(...)`. See the
[root README](../../README.md#install) for the CDN URL and its integrity hash.

## `mount(target, config)`

`target` is a CSS selector or an `Element`. The card is appended to it inside its own host element,
so your element is left exactly as the library found it when you unmount.

Returns a handle, or **`null` when nothing was rendered**. `null` is your cue to render your own
fallback into the slot — it never means the merchant was rejected.

```js
const card = mount('#capital', config);

card?.state; // what is rendered right now — see below
card?.update(nextConfig); // re-render in place, returns the new state
card?.unmount(); // remove the card and every listener it installed
```

A handle is only ever returned for `'prequalified'`, `'expired'`, or `'mounting'`, but `state`
tracks the lifecycle after that: `update()` can move it to any state including `'none'` (the new
config has no amount) or `'invalid'` (the new config is malformed), and `unmount()` leaves it at
`'none'`. So read `card.state` after a lifecycle call rather than assuming it still holds whatever
the mount returned.

### Config

| Key | Type | Notes |
| --- | --- | --- |
| `amount` | `number \| null` | Major currency units — `40000` renders as `$40,000`. `null`, omitted, or `0` renders nothing. |
| `currency` | `string` | ISO 4217. Defaults to `USD`. |
| `validUntil` | `string` | ISO 8601 — a date, or a datetime with an explicit offset. Once passed, the card renders its expired state. |
| `applyUrl` | `string` | Required whenever there is an amount. Absolute `https:`, or `http:` on loopback for local development. Pass the one from the prequalification response unchanged. |
| `lexicon` | `'loan' \| 'mca'` | Defaults to `loan`. Comes from the prequalification response. |
| `partnerName` | `string` | Renders as "for {name}", and names the site being left. |
| `locale` | `string` | BCP 47. Defaults to the browser's. |
| `copy` | `object` | The served regulated strings. See below. |
| `theme` | `object` | The seven tokens. See below. |
| `state` | `'auto' \| 'mounting'` | Set `mounting` while you fetch client-side. |
| `onEvent` | `function` | Analytics callback in your page. It does not phone home. |

### States

| State | What renders |
| --- | --- |
| `prequalified` | The full card. The only state that shows a figure. |
| `expired` | The amount and mechanism line are **removed from the DOM, not dimmed** — a stale figure is a compliance problem. The action still works, because the current number exists on Onramp. |
| `mounting` | Static blocks at roughly the final height. No spinner, no motion. |
| `none` | Nothing. `mount` returns `null` and yields the slot. Never reads as a rejection. |
| `invalid` | The config was malformed. Nothing renders and the reason is logged. Never a broken card in production. |

### The action

A full-page navigation to `applyUrl` in the same tab — not a popup and not a new tab, because the
merchant is deliberately leaving your product and that should be honest rather than disguised. The
library never constructs the URL.

Two things follow from that:

- **The departure notice names the host of `applyUrl`**, rather than asserting a destination. A
  card carrying Onramp's attribution row must not be able to say "Takes you to onrampfunds.com"
  while the link points elsewhere. If the host is not an Onramp one the card still renders and
  still tells the truth, and the mismatch is logged so you find out.
- **No referrer is sent.** Your dashboard URL routinely carries merchant identifiers, and nothing
  on our side needs it — the apply URL identifies the referral and attribution runs off a
  first-party cookie set after landing.

## Copy

Regulated strings are **served in the prequalification response, not compiled into this package**.
If they were baked in, a partner pinned to an old version would keep showing an old disclosure
after compliance revised it, and we would have no way to know.

Pass the `copy` block from the response straight through:

| Key | What it is |
| --- | --- |
| `qualifier` | The "pre-qualified, not approved" band. Load-bearing, not decoration. |
| `mechanism` | One sentence on how repayment works. |
| `disclosure` | The disclosure footer. |
| `expiredDisclosure` | The disclosure footer for the expired state. |

**They are required, and the library fails closed by refusing.** A string that is missing, `null`,
empty, whitespace, or the wrong type makes the whole config invalid: nothing renders and the
reason is logged. A card never reaches a merchant without its disclosure.

There are deliberately **no baked fallbacks**. A fallback would be compiled-in regulated copy —
exactly what serving the strings exists to avoid, since it is frozen at publish time and cannot be
revised without a release every partner has to take. It would also turn a missing field into a
silent substitution, so a server bug or a payload mangled in transit would render a plausible card
instead of failing where you would notice, which is worst during integration.

Which strings a card needs depends on what it renders:

| Card | Requires |
| --- | --- |
| Prequalified | `qualifier`, `mechanism`, `disclosure` |
| Expired | `expiredDisclosure` only — it shows neither a figure nor a mechanism line |
| Mounting, or no amount | none |

Served strings are rendered **verbatim**. The library appends nothing to them, so what compliance
signs off is what a merchant sees.

Everything else — the button label, the attribution row, the departure notice — is UI chrome that
carries no regulatory weight, so it ships in the package.

The two lexicons are not interchangeable. `mca` copy avoids "repayment", "term", "due", and
"credit", and never frames the advance as a debt. An unrecognised `lexicon` is **refused** rather
than guessed, because guessing would show an asset-purchase merchant loan vocabulary.

## Theme

Seven tokens, plus the optional `partnerName`. That is the whole surface.

| Token | Drives |
| --- | --- |
| `accent` | Action fill, attribution dot, qualifier band tint and border. Never body text. |
| `accentText` | The action label only. |
| `surface` | Card fill, and the mix partner for every muted tone. |
| `text` | Amount, qualifier, mechanism. Muted variants mix toward `surface`. |
| `border` | Card outline, rules, dividers. |
| `radius` | Card corner. A number is pixels. Inner elements derive from it, so `0` stays square and `24` stays coherent. |
| `fontStack` | Set at the root and inherited. Also accepts `font`, and the keywords `system`, `sans`, `serif`, `mono`. |

**Colours** accept hex, `rgb()`, `hsl()`, `oklab()`, `oklch()`, and common named colours, and
**must be opaque**. A value the library cannot parse — or one carrying alpha — is replaced with the
Onramp default and the reason is logged. We would rather render a legible card in the wrong brand
than an illegible one in the right brand.

Alpha is refused rather than approximated because a translucent token renders against your page,
which is outside the shadow root and unknowable from inside it. The contrast guard below would be
certifying a colour it cannot actually see. If you want a tinted surface, pass the resolved opaque
colour.

### The contrast guard

Tokens arrive at runtime and never reach our server, so contrast is checked in the browser at
mount, against WCAG AA (4.5:1 body text). The card derives its muted tones with `color-mix` in
Oklab, and the guard reproduces those mixes exactly, so it measures the tones that actually render
— the disclosure footer most of all, which is the tightest pairing on the card.

There are two fallbacks, in order of how much they take away:

1. **The action label is re-picked.** If `accentText` fails against `accent`, it becomes black or
   white by luminance. Nothing else changes and the partner's accent survives. This is the common
   case.
2. **Safe mode.** Only if the body pairing itself cannot be rescued: neutral text and surface, the
   accent demoted to a 3px top rule, and the action filled with ink. Guaranteed legible, and
   visibly not the partner's brand.

Both log a warning saying which pairing failed and by how much.

## Events

`onEvent(name, meta)` is called in your page for your own analytics. The library makes no request.

| Event | When |
| --- | --- |
| `view` | A prequalified card rendered. Carries `amount`, `currency`, `lexicon`, `safeMode`, and which served strings fell back. |
| `expired` | The expired card rendered. |
| `click` | The action was activated. The navigation is never prevented. |
| `skip` | Nothing rendered because there was no amount. |
| `error` | The config was malformed. Carries the reason. |

A handler that throws is caught and logged; it cannot take the card down.

## Isolation

The card renders into a **closed** shadow root. Your stylesheet cannot reach inside it, and it
leaks nothing into your page. That is what keeps the "pre-qualified, not approved" qualifier from
being hidden or shrunk — it is a regulatory requirement, not decoration, and
[there is a test that tries](../../packages/embed/e2e/card.spec.ts).

Two consequences worth knowing about:

- **`:host` is pinned to `display: block`.** For important declarations the cascade runs the other
  way round, so a shadow tree's rules beat the outer document's — your page cannot `display: none`
  our host element. You can of course hide your own container, and `unmount()` is the supported way
  to remove the card.
- **Styles install through constructable stylesheets**, not an inline `<style>`. Rules inserted
  through the CSSOM are not subject to `style-src`, so you need no CSP change beyond allowing our
  script source — no `'unsafe-inline'`, no nonce, no hash.

  To be precise about the guarantee: `adoptedStyleSheets` is supported by **every browser in the
  support matrix below** — it landed well before the container-query and `color-mix()` features
  that set the baseline — so on any browser that can render this card at all, the constructable
  path is the one that runs. There is a `<style>` fallback for engines without it (and for jsdom,
  under test). That fallback *is* subject to `style-src`, so under a strict policy on a
  sub-baseline engine it would be blocked and the card would render unstyled. A Playwright test
  asserts the constructable path is the one actually taken.

## Sizing

Every size is `clamp(min, N cqi, max)` against `container-type: inline-size` on the card root.
There are no media queries and no viewport units — the card sizes itself from the element you give
it and never knows the viewport. Verified at 300px, 520px, and 900px.

Nothing observes the DOM: no `ResizeObserver`, no `MutationObserver`, no timers, no animation.

## Browser support

Any browser with shadow DOM, container queries, and `color-mix()` — Chrome/Edge 111+, Safari 16.4+,
Firefox 113+. `mount()` degrades to a logged warning rather than throwing anywhere else.

## Server-side rendering

Importing the package on the server is inert — it touches no browser global at module scope. Call
`mount()` on the client, after hydration; on the server it logs a warning and returns `null`.

## License

[MIT](LICENSE).

**Trademark.** The MIT licence covers the code. It does not grant any right to use the Onramp Funds
name, logo, or other trademarks, or to access the Onramp Funds API or services.
