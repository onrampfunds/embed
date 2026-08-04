# Examples

Build the library first — both examples load the real UMD bundle from `packages/embed/dist`:

```sh
npm install
npm run build
```

## Plain HTML

```sh
open examples/plain-html/index.html
```

No server, no build step, no framework. A partner dashboard with the card in the sidebar, and
buttons to switch between every state: prequalified, expired, no amount, mounting, asset-purchase
copy, a dark token set, and a token set that fails contrast so you can watch the guard correct it.

Open the console for the `onEvent` stream and the contrast warnings.

## Server-rendered

```sh
node examples/server-rendered/server.mjs
# http://localhost:5173
```

The integration shape every SSR framework reduces to:

1. The **server** calls the prequalification endpoint and gets the amount, lexicon, apply URL, and
   the regulated copy. No credential reaches the browser.
2. The server renders its own HTML with an empty slot and the response serialised into the page.
3. The client mounts the card into that slot.

Importing `@onrampfunds/embed` on the server is inert, so it is safe in a shared module.
`mount()` is client-only — on the server it logs and returns `null` rather than throwing.

## React

Use [`@onrampfunds/embed-react`](../packages/embed-react):

```tsx
import { OnrampPrequalification } from '@onrampfunds/embed-react';

<OnrampPrequalification
  {...prequalification}
  onEvent={(name, meta) => analytics.track(`onramp:${name}`, meta)}
/>
```

The props are the core's mount config. The wrapper exists to get two things right that a
hand-rolled `useEffect` usually does not: an inline `onEvent` must not remount the card, and
strict mode's double-invoked effects must not produce two shadow roots. See
[its README](../packages/embed-react/README.md).
