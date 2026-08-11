# Integrating the prequalification card

**This file is written to be handed to a coding agent.** Paste it in whole, tell it which language
and framework your backend uses, and it has everything it needs — the browser half is fixed, and
the server half is ordinary code in whatever you already write.

If you are a human, it reads fine too.

---

## The shape of it

Two halves, and the split is the whole design.

| | Where | What it does |
| --- | --- | --- |
| **Server** | Your backend, any language | Calls Onramp with your credential, gets a prequalification, hands it to the page |
| **Browser** | `@onrampfunds/embed` | Renders what it was handed |

The card **makes no network requests**. It has no credential, no token, and no endpoint. Everything
it displays arrives as configuration. That is why your server has to do the fetching, and why
there is nothing to secure in the browser.

---

## Step 1 — Server: fetch the prequalification

> The endpoint is defined by the
> [partner API](https://github.com/onrampfunds/onramp-partner-api), not by this package — confirm
> against it if anything below seems out of date.

You send the merchant's **email**, their **operating state**, and their platform sales. You get
back an amount, a product lexicon, an apply URL, the regulated copy, and any stored theme — in
`camelCase`, shaped to forward straight into `mount()`.

The state is **required** and load-bearing: it decides which product applies, and therefore which
vocabulary is legally correct. A state Onramp does not operate in comes back with no amount.

```
POST   https://app.onrampfunds.com/partners/api/tokens
Body   { "client_id": ..., "client_secret": ... }   →   { "token": <JWT> }

GET    https://app.onrampfunds.com/partners/api/embed/prequalifications
Auth   Authorization: Bearer <JWT> — server-side only, never in the browser
Query  seller_email, operating_state, platforms[], optional business_name
```

The `platforms` parameter uses Rails bracket notation, repeated once per platform — **not**
indexed (`platforms[0][...]` is rejected):

```
?seller_email=merchant%40example.com
&operating_state=TX
&platforms[][type]=shopify
&platforms[][seller_id]=seller-1
&platforms[][sales][90_days]=45000.0
```

**A `200` with `amount: null` is a success, not an error** — it means the merchant cannot be
served. A `422` is an integration error, never a decline. **Handle failure by rendering the page
without the card.** A merchant's dashboard should not break because a financing panel is
unavailable.

**Do not cache the response.** It is served `Cache-Control: no-store`: the body holds a
merchant-specific amount and regulated copy with no expiry field to bound its staleness, and each
call is counted as an impression — a cached response both shows a stale figure and silently drops
renders from reporting.

---

## Step 2 — Connect the halves

The response is JSON that has to reach the widget. Two ways, both first-class — pick by how your
dashboard renders:

**(a) Direct data.** You already have the response where the page is built. Server-rendered
pages serialise it into a `<script type="application/json">` block and parse it in the browser —
**this is the step that goes wrong**, and it goes wrong the same way in every language, so the
escaping rules below are not optional. Client code that has already fetched just spreads the
response into `mount()`.

```html
<div id="capital"></div>
<script type="application/json" id="onramp-data">{ ...the response... }</script>
```

Three escaping rules. They are not optional, and two of them are invisible until they bite:

**1. Escape `<` as `\u003c`.** The regulated copy is prose written by other people. If any string
ever contains `</script>`, it closes your script element early and the page breaks in a way that
looks nothing like an encoding problem.

**2. Escape U+2028 and U+2029.** These are valid inside JSON strings but are line terminators in
JavaScript, so an unescaped one is a syntax error. They appear in text pasted from word processors.

**3. Do not HTML-escape the JSON.** A templating language that escapes by default will turn `"`
into `&quot;` and `JSON.parse` will fail. Mark it raw, or write it outside the template.

<details>
<summary>The same escape in several languages</summary>

```ruby
# Ruby
json = data.to_json.gsub('<', '\u003c').gsub("\u2028", '\u2028').gsub("\u2029", '\u2029')
# then emit with raw / html_safe, not the default escaping helper
```

```python
# Python
import json
s = json.dumps(data).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
# then mark safe: Markup(s) in Jinja, mark_safe(s) in Django
```

```php
// PHP — the flags do all three
echo json_encode($data, JSON_HEX_TAG | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
```

```go
// Go — html/template handles this correctly for a JSON context; encoding/json alone does not
```
</details>

**Also set the charset.** `<meta charset="utf-8">` in the first 1024 bytes of the document. The
copy contains em dashes; without it they render as `â€"`.

**(b) A `data` promise.** Your page fetches from your own backend instead of the server
serialising anything into the document. Expose the response at a session-authenticated JSON
endpoint on your origin and hand `mount()` the fetch:

```js
Onramp.mount('#capital', {
  data: fetch('/api/onramp-prequal').then((r) => r.json()),
  onEvent: (name, meta) => analytics.track(`onramp:${name}`, meta),
});
```

This folds the fetch, the pending state, and the no-offer case into one call: nothing renders
until the promise settles, a merchant with no offer sees nothing appear, and a rejected promise
yields the slot and reports an `error` event — the "render the page without the card" rule,
automated. Add `state: 'mounting'` beside `data` to show a themed skeleton while it waits.
`amount`, `currency`, `applyUrl`, `lexicon`, and `copy` must come from the resolved payload,
never inline beside `data`.

---

## Step 3 — Browser: mount

This half is exact. Everything below is the real contract.

```html
<script src="https://js.onrampfunds.com/embed/releases/<version>/onramp-embed.umd.js"
        integrity="sha384-<published with each release>"
        crossorigin="anonymous"></script>
<script>
  var data = JSON.parse(document.getElementById('onramp-data').textContent);
  data.partnerName = 'Your Platform';
  data.onEvent = function (name, meta) { yourAnalytics.track('onramp:' + name, meta); };

  var card = Onramp.mount('#capital', data);
  if (card === null) {
    // Nothing rendered. Put your own content in the slot — see "no amount" below.
  }
</script>
```

`crossorigin="anonymous"` is **required**, not decorative: subresource integrity only applies to a
cross-origin script fetched in CORS mode. Omit it and the browser refuses the script and reports
what looks like an integrity failure.

Or `npm install @onrampfunds/embed` and `import { mount }`. For React, use
[`@onrampfunds/embed-react`](packages/embed-react) — see [`examples/react`](examples/react).

### The config

| Key | Notes |
| --- | --- |
| `amount` | Major units — `40000` renders as `$40,000`. `null`, `0` or absent renders nothing. |
| `currency` | ISO 4217. Defaults to `USD`. |
| `applyUrl` | Absolute `https:`. **Never construct this.** Pass through the one you were given. |
| `lexicon` | `loan` or `mca`, from the response. An unrecognised value is refused rather than guessed. |
| `copy` | The regulated strings. **Required** — see below. |
| `theme` | Up to seven tokens. Colours must be opaque. |
| `partnerName` | Yours. Shown as "for {name}" and names the site being left. |
| `onEvent` | Your analytics. The card never phones home. |

### `copy` is required

There are no baked fallbacks, deliberately. A fallback would be compiled-in regulated copy —
frozen at publish time and unrevisable without every partner upgrading. **Forward the `copy` block
whole and unmodified.** If a string is missing the card renders nothing rather than substituting
wording compliance cannot revise. A prequalified card requires `qualifier`, `mechanism`, and
`disclosure`.

### When nothing renders

`mount()` returns `null` when there is no amount, or when the config is malformed (the reason is
logged). Check `amount` on the server and decide what fills the slot.

**Whatever you put there must never read as a rejection.** A merchant who does not qualify this
month may qualify next month. Do not write "not eligible", "declined", or "you don't qualify".

---

## Hard rules

- **Never put your partner credential in the browser.** The fetch is server-side. There is no
  browser-side authentication because there is no browser-side request.
- **Never construct or rewrite `applyUrl`.** Pass through what you were given.
- **Never edit the `copy` strings.** They are compliance-approved text. Forward them byte for byte.
- **Never cache the prequalification response.** It is served `Cache-Control: no-store`, and each
  call is counted as an impression.
- **Never hide the card with CSS.** The disclosure and the "not approved" qualifier are regulatory
  requirements, not decoration. If you need it gone, call `unmount()`.

## What you do not need to do

- No CORS configuration — the card makes no requests
- No CSP change beyond allowing `js.onrampfunds.com` in `script-src`
- No cookie or consent banner for the card itself
- No polyfills, no build step for the script-tag route, no runtime dependencies

## Checklist

- [ ] Credential is server-side only and absent from any client bundle
- [ ] Merchant's state is sent; an unsupported one is handled as "no amount"
- [ ] `<meta charset="utf-8">` present
- [ ] JSON escapes `<`, U+2028, U+2029, and is **not** HTML-escaped
- [ ] `copy` forwarded whole and unmodified
- [ ] `crossorigin="anonymous"` alongside `integrity`
- [ ] The no-amount slot has your own content and never reads as a rejection
- [ ] Card renders and the action navigates in the same tab

## More

[Full API](packages/embed/README.md) · [Plain HTML](examples/plain-html) ·
[Server-rendered](examples/server-rendered) · [React](examples/react)
