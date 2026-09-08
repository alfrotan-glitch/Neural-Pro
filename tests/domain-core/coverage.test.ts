/**
 * Coverage guard — every exported *value* of the kernel is directly exercised.
 *
 * The kernel is a contract surface: an exported function nobody tests is a rule
 * nobody verified. This suite walks `src/domain/core/**`, collects exported
 * functions/constants/classes and asserts each is referenced by a test.
 *
 * Type-only exports are excluded on purpose — a type is exercised by use, and
 * `AssetId` is an intentional forward declaration for WP-05.
 *
 * Classification: static (labelled as such).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { check, suite } from './harness';

const ROOT = resolve(new URL('../../', import.meta.url).pathname);
const CORE = join(ROOT, 'src/domain/core');
const TESTS = join(ROOT, 'tests/domain-core');

/** Exported names that are intentionally not referenced by a test yet. */
const ALLOWLIST: readonly string[] = [];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.ts$/.test(full)) out.push(full);
  }
  return out;
}

function valueExports(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(
    /export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
  )) {
    const name = match[1];
    if (name) names.push(name);
  }
  return names;
}

export default suite('coverage — every exported value of the core is exercised', () => {
  const testCorpus = walk(TESTS)
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

  check(testCorpus.length > 0, 'the test corpus is readable');

  const untested: string[] = [];
  let exported = 0;

  for (const file of walk(CORE)) {
    if (file.endsWith('index.ts')) continue; // barrel: re-exports only
    for (const name of valueExports(readFileSync(file, 'utf8'))) {
      if (ALLOWLIST.includes(name)) continue;
      exported += 1;
      if (!new RegExp(`\\b${name}\\b`).test(testCorpus)) {
        untested.push(`${relative(ROOT, file)}:${name}`);
      }
    }
  }

  check(exported > 0, 'the kernel exports values');
  check(
    untested.length === 0,
    `every exported value must be referenced by a test — untested: ${untested.join(', ') || 'none'}`,
  );
  console.log(`      coverage: ${exported} exported value(s), ${untested.length} untested`);
});
