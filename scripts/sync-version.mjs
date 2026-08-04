/**
 * Syncs the version into the three places Changesets does not know about.
 *
 * Changesets owns the published manifests and the wrapper's pin on the core. It cannot know about
 * a version exported from source, or about the private root manifest it deliberately ignores. Run
 * immediately after `changeset version`, so the whole bump is one atomic step rather than a manual
 * follow-up that gets forgotten — which is the failure this whole change exists to remove.
 *
 * `check:versions` still verifies the result. It is the backstop now, not the mechanism.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CORE, manifest, REACT, ROOT } from './lib.mjs';

const version = manifest(CORE).version;

/** Each target names the exact declaration it owns, so a near-miss fails loudly rather than silently. */
const targets = [
  {
    file: path.join(ROOT, CORE, 'src/constants.ts'),
    pattern: /(export const VERSION = ')([^']+)(')/,
    label: `${CORE}/src/constants.ts VERSION`,
  },
  {
    file: path.join(ROOT, REACT, 'src/index.ts'),
    pattern: /(export const version = ')([^']+)(')/,
    label: `${REACT}/src/index.ts version`,
  },
];

let changed = 0;

for (const target of targets) {
  const source = readFileSync(target.file, 'utf8');
  const match = target.pattern.exec(source);
  if (match === null) {
    console.error(`sync-version: could not find the version declaration in ${target.label}`);
    process.exit(1);
  }
  if (match[2] === version) {
    console.log(`  = ${target.label} already ${version}`);
    continue;
  }
  writeFileSync(target.file, source.replace(target.pattern, `$1${version}$3`));
  console.log(`  → ${target.label}: ${match[2]} → ${version}`);
  changed += 1;
}

// The root manifest is private, so Changesets leaves it alone. It is not published, but
// `check:versions` asserts it matches, and a repo whose own version lags its packages is a small
// lie that costs someone time later.
const rootPath = path.join(ROOT, 'package.json');
const root = JSON.parse(readFileSync(rootPath, 'utf8'));
if (root.version !== version) {
  console.log(`  → root package.json: ${root.version} → ${version}`);
  root.version = version;
  writeFileSync(rootPath, `${JSON.stringify(root, null, 2)}\n`);
  changed += 1;
}

console.log(changed === 0 ? 'sync-version: nothing to do' : `sync-version: updated ${changed}`);
