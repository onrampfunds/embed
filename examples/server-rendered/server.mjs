/**
 * A server-rendered integration, with no framework and no build step.
 *
 * This is the shape every SSR framework reduces to, and it is the part worth getting right:
 *
 *   1. The **server** calls the Onramp prequalification endpoint and gets back the amount, the
 *      lexicon, the apply URL, and the regulated copy. The browser never sees a credential and
 *      never makes a cross-origin request.
 *   2. The server renders its own HTML, including an empty slot for the card and the
 *      prequalification response serialised into the page.
 *   3. The client mounts the card into that slot after hydration.
 *
 * Importing `@onrampfunds/embed` on the server is inert — it touches no browser global at module
 * scope — so it is safe to have in a shared module. `mount()` is client-only, and says so rather
 * than throwing if you call it on the server.
 *
 *   node examples/server-rendered/server.mjs
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.resolve(here, '../../packages/embed/dist/onramp-embed.umd.js');
const PORT = Number(process.env.PORT ?? 5173);

/**
 * Stands in for `GET /partners/api/embed/prequalifications`. In production this is an
 * authenticated server-to-server call carrying the merchant's email, their operating state, and
 * their platform sales — and its response must not be cached (it is served
 * `Cache-Control: no-store`, and each call is counted as an impression).
 *
 * Note what comes back: the regulated strings are *served*, not compiled into the package, so
 * compliance can revise them without anyone shipping a release.
 */
async function fetchPrequalification(sellerEmail) {
  return {
    correlationId: '065a417b-ce17-4c64-b8dd-e35a3128a021',
    amount: 40000,
    currency: 'USD',
    applyUrl:
      'https://app.onrampfunds.com/partners/prequalifications/065a417b-ce17-4c64-b8dd-e35a3128a021',
    lexicon: 'loan',
    copy: {
      qualifier:
        'Pre-qualified, not approved. Onramp confirms the amount after reviewing your bank ' +
        'data — it can go up or down.',
      mechanism:
        'Repaid automatically as a share of your daily sales. The fee, the rate, and the ' +
        'expected length are set after review and shown in full before you accept anything.',
      disclosure:
        'Pre-qualification from Onramp Funds is not an offer of credit. All applications are ' +
        'subject to review prior to approval; the amount is derived from sales history alone ' +
        'and may change once bank data is reviewed.',
    },
    theme: { accent: '#2b5ce6', accentText: '#ffffff', radius: 10, font: 'system' },
  };
}

/**
 * Serialised for a `<script type="application/json">` block. `</script>` and the Unicode line
 * separators are the two things that will break you here, and neither is hypothetical when the
 * payload contains prose written by someone else.
 */
function serialise(value) {
  // `<` closes the script element early; U+2028 and U+2029 are valid JSON but are line
  // terminators in JavaScript, so an unescaped one is a syntax error in the page.
  return JSON.stringify(value).replace(
    /[<\u2028\u2029]/g,
    (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

function page(prequalification) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Onramp embed — server-rendered</title>
    <style>
      body { margin: 0; padding: 32px 20px; background: #f4f6fa; color: #1b2536;
             font: 15px/1.5 system-ui, -apple-system, sans-serif; }
      .shell { max-width: 460px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
      .panel { background: #fff; border: 1px solid #e2e6ee; border-radius: 10px; padding: 18px; }
      h1 { margin: 0; font-size: 20px; letter-spacing: -0.01em; }
      p.note { margin: 0; color: #6b7688; font-size: 13px; }
    </style>
  </head>
  <body>
    <div class="shell">
      <h1>Cartwheel Commerce</h1>
      <p class="note">
        This HTML was rendered on the server. The prequalification below was fetched server-side
        and handed to the card as configuration — the browser made no call to Onramp.
      </p>

      <div class="panel">
        <strong>Net sales</strong>
        <div>$128,940 this month</div>
      </div>

      <!-- The slot. Server-rendered empty; the card fills it on the client. -->
      <div id="capital"></div>
    </div>

    <script type="application/json" id="onramp-prequalification">${serialise(prequalification)}</script>
    <script src="/onramp-embed.umd.js"></script>
    <script>
      (function () {
        var slot = document.getElementById('onramp-prequalification');
        var config = JSON.parse(slot.textContent);

        config.onEvent = function (name, meta) {
          console.log('onramp:' + name, meta);
        };

        // Returns null when there is no amount — that is the cue to render your own fallback,
        // not a rejection of the merchant.
        var card = Onramp.mount('#capital', config);
        if (card === null) {
          var panel = document.createElement('div');
          panel.className = 'panel';

          var heading = document.createElement('strong');
          heading.textContent = 'Working capital';

          var body = document.createElement('div');
          body.textContent = 'Check back after a few more weeks of sales.';

          panel.append(heading, body);
          document.getElementById('capital').replaceChildren(panel);
        }
      })();
    </script>
  </body>
</html>`;
}

const server = createServer(async (request, response) => {
  if (request.url === '/onramp-embed.umd.js') {
    try {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(readFileSync(BUNDLE));
    } catch {
      response.writeHead(500, { 'content-type': 'text/plain' });
      response.end('Build the library first: npm run build');
    }
    return;
  }

  if (request.url !== '/') {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('Not found');
    return;
  }

  const prequalification = await fetchPrequalification('merchant@example.com');
  // Yours, not the API's: shown as "for Cartwheel", and names the site the merchant is leaving.
  prequalification.partnerName = 'Cartwheel';
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(page(prequalification));
});

server.listen(PORT, () => {
  console.log(`Server-rendered example on http://localhost:${PORT}`);
});
