/**
 * Both packages publish at the same version from the same release, and the wrapper pins the core
 * exactly — so a partner never has to work out which wrapper pairs with which core.
 *
 * The exported `version` constant is checked here too. It is baked into the bundle and stamped
 * onto the host element, so a stale one makes a partner's bug report point at the wrong release.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CORE, manifest, REACT, reporter, ROOT, rootManifest } from './lib.mjs';

const report = reporter('Lockstep versions');

const root = rootManifest();
const core = manifest(CORE);
const react = manifest(REACT);

report.check(
  'both packages are at the same version',
  core.version === react.version,
  `${core.name}@${core.version}, ${react.name}@${react.version}`,
);

report.check(
  'the repo version matches the packages',
  root.version === core.version,
  `repo ${root.version}, packages ${core.version}`,
);

report.check(
  `${react.name} pins ${core.name}@${core.version} exactly`,
  react.dependencies?.[core.name] === core.version,
  react.dependencies?.[core.name] ?? 'missing',
);

// Both packages carry their version as a source literal so it can be exported at runtime. Neither
// can be allowed to drift from its manifest — a stale one makes a partner's bug report point at
// the wrong release.
const constants = readFileSync(path.join(ROOT, CORE, 'src/constants.ts'), 'utf8');
const declared = /export const VERSION = '([^']+)'/.exec(constants)?.[1];
report.check(
  `${core.name} exports a VERSION matching its package.json`,
  declared === core.version,
  `constants.ts ${declared}, package.json ${core.version}`,
);

const wrapperSource = readFileSync(path.join(ROOT, REACT, 'src/index.ts'), 'utf8');
const wrapperDeclared = /export const version = '([^']+)'/.exec(wrapperSource)?.[1];
report.check(
  `${react.name} exports a version matching its package.json`,
  wrapperDeclared === react.version,
  `src/index.ts ${wrapperDeclared}, package.json ${react.version}`,
);

report.check(
  'both packages are MIT',
  core.license === 'MIT' && react.license === 'MIT',
  `${core.license} / ${react.license}`,
);

report.done();
