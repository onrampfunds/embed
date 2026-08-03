/**
 * "The library makes no network calls" is the claim the whole architecture rests on — it is what
 * removes CORS, browser credentials, the embed token, and the enumeration surface. So it is
 * asserted against the built artefacts rather than trusted.
 *
 * The Playwright suite proves the same thing dynamically by counting requests during a mount.
 * This is the static half: if any of these APIs is ever referenced, the build fails.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CORE, reporter, ROOT } from './lib.mjs';

const FORBIDDEN = [
  { name: 'fetch', pattern: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket', pattern: /\bWebSocket\b/ },
  { name: 'EventSource', pattern: /\bEventSource\b/ },
  { name: 'sendBeacon', pattern: /\bsendBeacon\b/ },
  { name: 'navigator.connection', pattern: /\bnavigator\s*\.\s*connection\b/ },
  { name: 'importScripts', pattern: /\bimportScripts\s*\(/ },
  { name: 'new Image', pattern: /new\s+Image\s*\(/ },
  { name: 'document.cookie', pattern: /\bdocument\s*\.\s*cookie\b/ },
  { name: 'localStorage', pattern: /\blocalStorage\b/ },
  { name: 'sessionStorage', pattern: /\bsessionStorage\b/ },
  { name: 'indexedDB', pattern: /\bindexedDB\b/ },
];

const BUNDLES = ['dist/index.mjs', 'dist/index.cjs', 'dist/onramp-embed.umd.js'];

const report = reporter('No network, no storage');

for (const relative of BUNDLES) {
  const absolute = path.join(ROOT, CORE, relative);
  if (!existsSync(absolute)) {
    report.check(`${relative} exists`, false, 'run `npm run build` first');
    continue;
  }

  const source = readFileSync(absolute, 'utf8');
  const found = FORBIDDEN.filter((api) => api.pattern.test(source)).map((api) => api.name);
  report.check(
    `${relative} reaches for nothing`,
    found.length === 0,
    found.length === 0 ? undefined : `found ${found.join(', ')}`,
  );
}

report.done();
