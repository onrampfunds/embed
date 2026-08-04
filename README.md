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
so it works from a script tag today if you serve it yourself.

> **The hosted CDN is not live yet.** `js.onrampfunds.com` does not exist at the time of writing —
> npm is the supported path. The section below is the shape it will take, recorded here so the
> release workflow and the docs agree; do not paste these URLs into a partner integration until
> this note is gone.

When it does exist, it will serve **immutable, version-pinned** paths. Pin the exact version and
check the integrity hash, which is published in each GitHub release:

```html
<script
  src="https://js.onrampfunds.com/embed/0.0.1/onramp-embed.umd.js"
  integrity="sha384-<published with each release>"
  crossorigin="anonymous"
></script>
```

A `v1` alias will also resolve to the newest 1.x build, for partners who cannot pin. It carries
**no** integrity hash by design — you cannot have both a mutable alias and a fixed hash. Pin the
version if you can.

## Use

Your backend calls the Onramp prequalification endpoint server-side and passes the result straight
into `mount()`. The library itself makes **no network calls** — there is no token to mint, no CORS
to negotiate, and nothing to enumerate from the browser.

```js
Onramp.mount('#capital', {
  amount: 40000,
  currency: 'USD',
  validUntil: '2026-08-06T07:00:00Z',
  applyUrl: 'https://onrampfunds.com/p/abc123...',
  lexicon: 'loan',
  copy: {
    /* regulated strings from the prequalification response */
  },
  theme: { accent: '#5B21B6', radius: 8, font: 'system' },
  onEvent: (name, meta) => analytics.track(`onramp:${name}`, meta),
});
```

Full API, token reference, and copy contract: [`packages/embed/README.md`](packages/embed/README.md).

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
- **It never renders a card without a disclosure.** Every served string has a baked fallback.

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
