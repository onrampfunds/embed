/**
 * MIT means the licence has to be *in the tarball*, not just in the repo — npm shows the field on
 * the package page and a partner's legal review looks for the file. `npm pack --dry-run` is the
 * only thing that tells the truth about what will actually publish.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { CORE, manifest, REACT, reporter, ROOT } from './lib.mjs';

const report = reporter('Published tarballs');

function packedFiles(packageDir) {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: path.join(ROOT, packageDir),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(output);
  return (parsed[0]?.files ?? []).map((entry) => entry.path);
}

const expectations = [
  { dir: CORE, required: ['LICENSE', 'README.md', 'package.json', 'dist/index.d.ts'] },
  { dir: REACT, required: ['LICENSE', 'README.md', 'package.json'] },
];

for (const expectation of expectations) {
  const pkg = manifest(expectation.dir);
  let files;
  try {
    files = packedFiles(expectation.dir);
  } catch (error) {
    // `execFileSync` can throw something without a usable `.message`, and letting this line throw
    // would hide the packing failure it is meant to report.
    const detail = String(error?.message ?? error ?? 'unknown error').split('\n')[0];
    report.check(`${pkg.name} packs`, false, detail);
    continue;
  }

  for (const required of expectation.required) {
    report.check(`${pkg.name} ships ${required}`, files.includes(required));
  }

  // Nothing from the working tree should escape into a published package.
  const leaked = files.filter((file) =>
    /(^|\/)(test|e2e|node_modules)\//.test(file) || file.endsWith('.tsbuildinfo'),
  );
  report.check(
    `${pkg.name} ships no test or build residue`,
    leaked.length === 0,
    leaked.length === 0 ? `${files.length} files` : leaked.join(', '),
  );
}

report.done();
