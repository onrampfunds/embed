# Onramp Funds embed

The in-page prequalification component. A partner platform renders it inside its own merchant
dashboard to show a merchant what they are **pre-qualified** for with Onramp Funds, and to invite
them to continue on Onramp.

It renders into a **closed shadow root** in the partner's page — not an iframe, not a hosted page.

| Package | What it is |
| --- | --- |
| [`@onrampfunds/embed`](packages/embed) | The core library. Renders the card. Zero dependencies. |
| [`@onrampfunds/embed-react`](packages/embed-react) | A thin React wrapper around the core. |

Both packages publish at the same version from the same release, and the wrapper depends on an
exact core version — you never have to reason about which wrapper pairs with which core.

## Install

```sh
npm install @onrampfunds/embed
```

A UMD build ships in the package as `dist/onramp-embed.umd.js` and exposes `Onramp` as a global,
and is also served from an Onramp-controlled origin. **Pin the exact version and check the
integrity hash** — the hash for each release is in its GitHub release notes:

```html
<script
  src="https://js.onrampfunds.com/embed/releases/0.0.5/onramp-embed.umd.js"
  integrity="sha384-<published with each release>"
  crossorigin="anonymous"
></script>
```

Version paths are immutable and enforced as such by the storage layer, so a pinned hash stays
valid forever. `crossorigin="anonymous"` is required rather than optional — subresource integrity
only applies to a cross-origin script when the request is made in CORS mode.

A moving alias also exists for partners who cannot pin:

```
https://js.onrampfunds.com/embed/v0/onramp-embed.umd.js
```

It carries **no** integrity hash by design — you cannot have both a mutable alias and a fixed
hash — and it tracks the newest release of that major version. **Before 1.0, prefer pinning.**
Under semver, 0.x minors may carry breaking changes, so the `v0` alias moves across them; from 1.0
onward `v1` will only ever move within backwards-compatible releases.

You need no CSP change beyond allowing `js.onrampfunds.com` in `script-src`. The library still
makes no network requests of its own.

## Use

Your backend calls the Onramp prequalification endpoint server-side and passes the result straight
into `mount()`. The library itself makes **no network calls** — there is no token to mint, no CORS
to negotiate, and nothing to enumerate from the browser.

```js
Onramp.mount('#capital', {
  amount: 40000,
  currency: 'USD',
  applyUrl: 'https://onrampfunds.com/p/abc123...',
  lexicon: 'loan',
  copy: {
    /* regulated strings from the prequalification response */
  },
  theme: { accent: '#5B21B6', radius: 8, font: 'system' },
  onEvent: (name, meta) => analytics.track(`onramp:${name}`, meta),
});
```

In practice you do not write these out — every field except `onEvent` comes from the
prequalification response, so you forward it:

```js
const prequalification = await yourBackend.fetchOnrampPrequalification(merchantId);

Onramp.mount('#capital', {
  ...prequalification,
  onEvent: (name, meta) => analytics.track(`onramp:${name}`, meta),
});
```

If your page fetches the prequalification from your backend itself, you can hand `mount()` the
fetch instead and let it handle the waiting:

```js
Onramp.mount('#capital', {
  data: fetch('/api/onramp-prequal').then((r) => r.json()),
  onEvent: (name, meta) => analytics.track(`onramp:${name}`, meta),
});
```

Nothing renders until the promise settles — then the card, or nothing at all for a merchant with
no offer, exactly as if you had passed the values directly. Add `state: 'mounting'` to show a
themed skeleton while it waits. The library still makes no network requests of its own: your
code creates the promise, so your session auth just works. Both forms are equal citizens —
direct config is the primitive, `data` is a convenience over it.

Full API, token reference, and copy contract: [`packages/embed/README.md`](packages/embed/README.md).

**Writing the server half?** [`INTEGRATING.md`](INTEGRATING.md) covers it language-agnostically —
the backend is ordinary code in whatever you already write, and the guide is written to be handed
to a coding agent wholesale.

## What it guarantees

- **Zero runtime dependencies** and **zero network requests**, both asserted in CI.
- **Under 40KB gzipped**, asserted in CI. The real figure is far below the budget.
- **Style isolation in both directions.** Partner CSS cannot reach inside the shadow root, and the
  component leaks nothing into the partner's page. There is a test that tries.
- **No CSP change beyond the script source.** Styles are installed through constructable
  stylesheets rather than inline `<style>`, so `style-src 'unsafe-inline'` is not required. Every
  browser this library supports implements them; the `<style>` fallback only exists for engines
  below that baseline, where a strict `style-src` would block it. See
  [the note in the package README](packages/embed/README.md#isolation).
- **WCAG AA inside the shadow root.** Partner tokens that fail contrast are corrected at mount and
  the reason is logged.
- **It never renders a card without a disclosure.** The regulated strings are required; a response
  missing one is refused and nothing renders, rather than substituting compiled-in copy that
  compliance could not revise.

## Repository layout

```
packages/embed/         the core library
packages/embed-react/   the React wrapper
examples/              plain HTML and server-rendered integrations
scripts/               the CI guards (bundle budget, zero deps, zero network, tarballs)
```

## Development

```sh
npm install
npm run verify      # typecheck, build, unit tests, and every CI guard
npm run test:e2e    # Playwright: shadow-DOM isolation, container queries, keyboard
```

`npm run test:e2e` needs a browser once: `npx playwright install chromium`.

## Security

Please do not open a public issue for a security problem. See [SECURITY.md](SECURITY.md) for the
disclosure path.

## License

[MIT](LICENSE). Both packages ship the licence in their published tarballs.

**Trademark.** The MIT licence covers the code in this repository. It does not grant any right to
use the Onramp Funds name, logo, or other trademarks, to describe a fork or derivative work as
being from Onramp Funds, or to access the Onramp Funds API or services.
