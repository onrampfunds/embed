# Security policy

This code runs inside our partners' merchant dashboards, so we would much rather hear about a
problem early and awkwardly than late and politely.

## Reporting a vulnerability

**Please do not open a public GitHub issue, pull request, or discussion for a security problem.**

Report it privately, either way:

- **GitHub** — [open a private security advisory](https://github.com/onrampfunds/embed/security/advisories/new).
  This is the preferred route; it gives us a private place to work the issue with you.
- **Email** — <security@onrampfunds.com>.

Please include, as far as you have it: what the issue is, which version or commit you were looking
at, the browser and platform, and the smallest reproduction you can manage. If you have a proof of
concept, a link to a minimal page is worth more than a description.

## What to expect

| | |
| --- | --- |
| We acknowledge your report | within 3 business days |
| We give you an initial assessment | within 10 business days |
| We aim to ship a fix for a confirmed issue | within 90 days, sooner the more serious it is |

We will keep you updated while we work, and we will tell you when the fix ships. If you would like
credit in the advisory, say so and we will name you; if you would rather not be named, that is
fine too.

We ask that you give us a reasonable chance to fix a confirmed issue before you disclose it
publicly. We will not pursue or support legal action against anyone who reports in good faith
under this policy, and we do not currently run a paid bounty.

## Scope

**In scope** — anything in this repository, and the published `@onrampfunds/embed` and
`@onrampfunds/embed-react` packages. Since the library renders into a partner's page, the things
we care most about are: escaping the shadow root, injecting markup or script through
configuration, leaking data out of the partner's page, and anything that could cause a card to
render **without its disclosure** or with a **stale amount**.

**Out of scope** — the Onramp Funds web application and API (report those to
<security@onrampfunds.com> as well, but they are not tracked here), and findings that depend on a
partner deliberately passing hostile configuration into their own page, which is a trust boundary
that does not exist.

## What this library does not do

Useful context when you are assessing it:

- It makes **no network requests** of any kind. There is no telemetry, beacon, or pixel.
- It holds **no credential or token**. The partner fetches prequalification data server-side.
- It **never constructs the apply URL**; it renders the one it is handed, and only as an
  `https:` link.
