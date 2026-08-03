/**
 * The card runs in the partner's page and costs them real Core Web Vitals, so the budget is a
 * build failure rather than a guideline.
 *
 * The number that matters is the gzipped UMD build: that is what a partner loads from a script
 * tag. The ESM build is measured too, but only for information — a bundler will tree-shake and
 * re-compress it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { CORE, reporter, ROOT } from './lib.mjs';

/** The budget from CTO-343. */
const BUDGET_BYTES = 40 * 1024;

const report = reporter(`Bundle budget (${BUDGET_BYTES / 1024}KB gzipped)`);

const targets = [
  { file: 'dist/onramp-embed.umd.js', enforced: true },
  { file: 'dist/index.mjs', enforced: false },
];

for (const target of targets) {
  const absolute = path.join(ROOT, CORE, target.file);
  if (!existsSync(absolute)) {
    report.check(`${target.file} exists`, false, 'run `npm run build` first');
    continue;
  }

  const raw = readFileSync(absolute);
  const gzipped = gzipSync(raw, { level: 9 }).length;
  const percent = ((gzipped / BUDGET_BYTES) * 100).toFixed(1);
  const detail = `${(raw.length / 1024).toFixed(1)}KB raw, ${(gzipped / 1024).toFixed(1)}KB gzipped (${percent}% of budget)`;

  if (target.enforced) {
    report.check(`${target.file} is within budget`, gzipped <= BUDGET_BYTES, detail);
  } else {
    console.log(`  · ${target.file} — ${detail}`);
  }
}

report.done();
