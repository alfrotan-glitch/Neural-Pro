/**
 * Boundary suite — dependency direction.
 *
 * INV-015 / ADR-012: `src/domain/**` is the innermost layer and depends on
 * nothing outside itself. This suite makes that executable instead of relying on
 * a reviewer noticing an import.
 *
 * Classification: static (labelled as such — import direction cannot be proven
 * by executing the code).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { check, suite } from './harness';

const ROOT = resolve(new URL('../../', import.meta.url).pathname);
const SRC = join(ROOT, 'src');
const DOMAIN = join(SRC, 'domain');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** Relative import specifiers in a file, comments stripped. */
function importSpecifiers(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return [...code.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1] ?? '');
}

export default suite('boundaries — the domain layer depends on nothing outside itself', () => {
  const domainFiles = walk(DOMAIN);
  check(domainFiles.length > 0, 'the domain layer exists');

  // ---- permanent rule: no edge leaves src/domain -------------------------
  for (const file of domainFiles) {
    const source = readFileSync(file, 'utf8');
    for (const spec of importSpecifiers(source)) {
      const resolved = relative(ROOT, resolve(join(file, '..'), spec));
      check(
        resolved.startsWith('src/domain/'),
        `${relative(ROOT, file)} must import only from src/domain (found ${spec})`,
      );
    }
  }

  // ---- permanent rule: nothing outside src/domain is imported by name ----
  for (const file of domainFiles) {
    const source = readFileSync(file, 'utf8');
    check(!/from\s+['"]\.\.?\/(?:\.\.\/)*(?:components|features|core|store|lib|config)\//.test(source),
      `${relative(ROOT, file)} must not reach into the legacy layer roots by path`);
    check(!/from\s+['"]\.\.?\/(?:\.\.\/)*types(\.ts)?['"]/.test(source),
      `${relative(ROOT, file)} must not import the deleted root type barrels`);
  }

  // ---- adoption state (reported, NOT asserted) ---------------------------
  // Who imports the kernel today is a fact a reviewer needs, but it must never
  // become a failing assertion: WP-03/05/08/11 are *expected* to wire it in, and
  // a test that fails the moment adoption starts would be a test that blocks the
  // programme. So it is printed, and the parity suite is what guards behaviour.
  const productionFiles = walk(SRC).filter((f) => !f.startsWith(DOMAIN));
  const importers = productionFiles.filter((f) =>
    importSpecifiers(readFileSync(f, 'utf8')).some((spec) =>
      resolve(join(f, '..'), spec).startsWith(DOMAIN),
    ),
  );

  // The server is `server.ts` today and `server/**` after WP-01 splits it; the
  // suite must survive that move rather than break on a missing file.
  const serverFiles = [join(ROOT, 'server.ts'), join(ROOT, 'server')]
    .filter((p) => existsSync(p))
    .flatMap((p) => (statSync(p).isDirectory() ? walk(p) : [p]));
  const serverImporters = serverFiles.filter((f) =>
    readFileSync(f, 'utf8').includes('src/domain'),
  );

  console.log(
    `      adoption: ${importers.length} production module(s) import src/domain; ` +
      `${serverFiles.length} server file(s) scanned, ${serverImporters.length} referencing src/domain`,
  );
  for (const file of serverImporters) console.log(`        · server: ${relative(ROOT, file)}`);
  for (const file of importers) console.log(`        · ${relative(ROOT, file)}`);

  check(true, 'adoption state recorded (informational — not an assertion)');
});
