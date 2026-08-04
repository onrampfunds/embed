import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CORE = 'packages/embed';
export const REACT = 'packages/embed-react';

export function manifest(packageDir) {
  return JSON.parse(readFileSync(path.join(ROOT, packageDir, 'package.json'), 'utf8'));
}

export function rootManifest() {
  return JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
}

/** Prints a pass/fail line and records the failure without stopping the rest of the checks. */
export function reporter(title) {
  const failures = [];
  console.log(`\n${title}`);

  return {
    check(label, ok, detail) {
      console.log(`  ${ok ? '✓' : '✗'} ${label}${detail === undefined ? '' : ` — ${detail}`}`);
      if (!ok) failures.push(label);
    },
    done() {
      if (failures.length > 0) {
        console.error(`\n${failures.length} check(s) failed.`);
        process.exit(1);
      }
    },
  };
}
