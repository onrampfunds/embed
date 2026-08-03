/**
 * The core library must have no runtime dependencies at all, and the React wrapper must have
 * exactly one — the core, pinned to an exact version so the pair can never drift.
 *
 * This runs in CI because "zero dependencies" is a promise we make to partners in the README, and
 * a transitive dependency is exactly the kind of thing that arrives without anyone deciding to
 * add it.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CORE, manifest, REACT, reporter, ROOT } from './lib.mjs';

const report = reporter('Runtime dependencies');

const core = manifest(CORE);
const react = manifest(REACT);

const coreDeps = Object.keys(core.dependencies ?? {});
report.check(
  `${core.name} has no runtime dependencies`,
  coreDeps.length === 0,
  coreDeps.length === 0 ? undefined : coreDeps.join(', '),
);
report.check(
  `${core.name} has no optional or bundled dependencies`,
  core.optionalDependencies === undefined && core.bundledDependencies === undefined,
);

const reactDeps = Object.entries(react.dependencies ?? {});
report.check(
  `${react.name} depends only on ${core.name}`,
  reactDeps.length === 1 && reactDeps[0][0] === core.name,
  reactDeps.map(([name, range]) => `${name}@${range}`).join(', ') || 'none',
);
report.check(
  `${react.name} pins ${core.name} to an exact version`,
  reactDeps.length === 1 && reactDeps[0][1] === core.version,
  reactDeps.length === 1 ? `${reactDeps[0][1]} (core is ${core.version})` : undefined,
);
report.check(
  `${react.name} takes React as a peer, not a dependency`,
  react.peerDependencies?.react !== undefined && react.dependencies?.react === undefined,
);

// The published bundles must also be self-contained: nothing left for a bundler to resolve.
const bundles = [
  path.join(CORE, 'dist/index.mjs'),
  path.join(CORE, 'dist/index.cjs'),
  path.join(CORE, 'dist/onramp-embed.umd.js'),
];

/**
 * Every way a module specifier can survive into built output. The static forms matter most and
 * are the easiest to miss: `import 'y'` has a quote right after the keyword, but
 * `import { x } from 'y'` does not, so a naive `import\s*['"]` pattern sees nothing.
 */
const SPECIFIER_PATTERNS = [
  { name: 'static import/export', pattern: /(?:^|[\s;})])(?:import|export)\b[^;]{0,300}?\bfrom\s*['"][^'"]+['"]/g },
  { name: 'side-effect import', pattern: /(?:^|[\s;})])import\s*['"][^'"]+['"]/g },
  { name: 'dynamic import', pattern: /\bimport\s*\(\s*['"][^'"]+['"]/g },
  { name: 'require', pattern: /\brequire\s*\(\s*['"][^'"]+['"]/g },
];

for (const relative of bundles) {
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) {
    report.check(`${relative} exists`, false, 'run `npm run build` first');
    continue;
  }

  const source = readFileSync(file, 'utf8');
  const found = [];
  for (const { name, pattern } of SPECIFIER_PATTERNS) {
    for (const match of source.match(pattern) ?? []) {
      found.push(`${name}: ${match.trim().replace(/\s+/g, ' ')}`);
    }
  }

  report.check(
    `${relative} resolves nothing at runtime`,
    found.length === 0,
    found.length === 0 ? undefined : found.join(' | '),
  );
}

report.done();
