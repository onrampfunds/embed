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

> **Confirm the specifics against the partner API documentation before writing this.** The route,
> authentication scheme, and exact field names are defined by the API, not by this package, and
> this repository is not their source of truth. What follows is the shape; the names may differ.

You send a merchant identifier, the merchant's **state**, and aggregate sales. You get back an
amount, a product lexicon, an apply URL, the regulated copy, and any stored theme.

The merchant's state is **required** and load-bearing: it decides which product applies, and
therefore which vocabulary is legally correct. A state Onramp does not operate in comes back with
no amount.

```
POST   <partner API base>/prequalifications
Auth   your partner credential — server-side only, never in the browser
Body   merchant identifier, state, aggregate sales
```

**Handle failure by rendering the page without the card.** A merchant's dashboard should not break
because a financing panel is unavailable.

**Caching is your call, with one constraint:** never cache past `validUntil`. Onramp counts each
call as an impression, so caching trades reporting granularity for latency — choose deliberately.

---

## Step 2 — Server: get it into the page

The response is JSON that has to reach your JavaScript. **This is the step that goes wrong**, and
it goes wrong the same way in every language.

Serialise into a `<script type="application/json">` block and parse it in the browser:

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
| `validUntil` | ISO 8601 — a date, or a datetime with an **explicit offset**. One without an offset is read as local time, which makes the same string a different instant per merchant. |
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
wording compliance cannot revise.

| Card | Requires |
| --- | --- |
| Prequalified | `qualifier`, `mechanism`, `disclosure` |
| Expired | `expiredDisclosure` |

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
- **Never cache a prequalification past its `validUntil`.**
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
