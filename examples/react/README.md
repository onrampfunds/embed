# React

```sh
npm install @onrampfunds/embed-react
```

Two files, because the work splits cleanly in two:

| | |
| --- | --- |
| [`page.tsx`](page.tsx) | **Server.** Calls Onramp with the partner's credential and forwards the response. |
| [`capital-panel.tsx`](capital-panel.tsx) | **Client.** Renders the card, or decides what goes in the slot instead. |

Written for the Next.js App Router because the server/client boundary is explicit there, but the
shape is the same anywhere: fetch on a server, render on a client. Neither file is wired to a
build — they are here to be read and copied.

## The three things worth knowing

**An inline `onEvent` is fine.** This is the whole reason the wrapper exists. A new function
identity on every parent render does not tear down and rebuild the shadow root — the effect is
keyed on a value-based signature of the config, and callbacks are read through a ref at call time.
Hand-rolling this with `useEffect` is exactly where it goes wrong.

**Forward the response whole.** `amount`, `currency`, `applyUrl`, `lexicon`, `copy` and `theme`
all come from the prequalification endpoint. Spread it rather than picking fields out
of it — and note `copy` carries the regulated strings and is **required**. Without it the card
renders nothing, deliberately, rather than falling back to wording compliance cannot revise.

**Branch on `amount` yourself for the empty case.** When there is no amount the card renders
nothing and yields the slot, which means it cannot tell you it did. You already have the data on
the server, so checking it there is both simpler and lets you decide what occupies the space. A
merchant who does not qualify this month may qualify next month — whatever you put there should
never read as a rejection.

## If you would rather own the lifecycle

The wrapper is a convenience, not a requirement. `mount()` from
[`@onrampfunds/embed`](../../packages/embed) is a `ref` and a `useEffect` — the two problems above
are then yours to solve, and the second one is subtler than it looks.

## Other integrations

[Plain HTML](../plain-html) · [Server-rendered, no framework](../server-rendered)
