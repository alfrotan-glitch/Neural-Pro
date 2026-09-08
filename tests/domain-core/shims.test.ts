/**
 * Shim governance suite — ADR-013.
 *
 * ADR-013 rule: every compatibility shim carries an ID, a named owner, a removal
 * milestone and a marker comment at the definition site, and a test fails when a
 * milestone passes. SHIM-006 and SHIM-007 were introduced with the canonical
 * core, so the core owns their enforcement.
 *
 * This suite cross-checks the **code markers** against the **register** in
 * `docs/decisions/ADR-013-compatibility-shim-policy.md`. A shim in one place and
 * not the other is exactly how a shim becomes permanent unnoticed.
 *
 * Classification: static (labelled as such).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { check, suite } from './harness';

const ROOT = resolve(new URL('../../', import.meta.url).pathname);
const DOMAIN = join(ROOT, 'src/domain');
const ADR013 = join(ROOT, 'docs/decisions/ADR-013-compatibility-shim-policy.md');

const CORE_OWNER = 'core-architecture';

/** Compare owner/milestone tokens tolerantly (spacing, case, separators). */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

interface Marker {
  readonly id: string;
  readonly owner: string;
  readonly remove: string;
  readonly reason: string;
  readonly file: string;
}

interface RegisterRow {
  readonly id: string;
  readonly owner: string;
  readonly remove: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const MARKER_PATTERN =
  /SHIM-(\d{3})\s+owner=(\S+)\s+remove=(\S+)\s+reason=(\S+)/g;

function collectMarkers(): Marker[] {
  const markers: Marker[] = [];
  for (const file of walk(DOMAIN)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(MARKER_PATTERN)) {
      markers.push({
        id: `SHIM-${match[1]}`,
        owner: normalize(match[2] ?? ''),
        remove: normalize(match[3] ?? ''),
        reason: match[4] ?? '',
        file: relative(ROOT, file),
      });
    }
  }
  return markers;
}

function collectRegister(): RegisterRow[] {
  const rows: RegisterRow[] = [];
  const source = readFileSync(ADR013, 'utf8');
  for (const line of source.split('\n')) {
    const match = /^\|\s*(SHIM-\d{3})\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/.exec(line);
    if (!match) continue;
    // The milestone cell may carry prose ("WP-12 (earlier if …)"); the milestone
    // itself is the WP token.
    const milestone = /wp-\d{2}/.exec(normalize(match[4] ?? ''))?.[0] ?? normalize(match[4] ?? '');
    rows.push({
      id: match[1] ?? '',
      owner: normalize(match[3] ?? ''),
      remove: milestone,
    });
  }
  return rows;
}

export default suite('shims — every core shim is registered, owned and time-boxed', () => {
  const markers = collectMarkers();
  const register = collectRegister();

  check(register.length > 0, 'the ADR-013 shim register is parseable');
  check(markers.length > 0, 'src/domain declares its shims with markers');

  // Every marker in code is in the register, with a matching owner and milestone.
  for (const marker of markers) {
    const row = register.find((r) => r.id === marker.id);
    check(row !== undefined, `${marker.id} (${marker.file}) is registered in ADR-013`);
    if (!row) continue;
    check(row.owner === marker.owner, `${marker.id} owner matches the register (code ${marker.owner}, register ${row.owner})`);
    check(row.remove === marker.remove, `${marker.id} removal milestone matches the register (code ${marker.remove}, register ${row.remove})`);
    check(marker.reason.length > 0, `${marker.id} states a reason`);
  }

  // Every shim the core owns has at least one marker at its definition site.
  for (const row of register.filter((r) => r.owner === CORE_OWNER)) {
    const marked = markers.some((m) => m.id === row.id);
    check(marked, `${row.id} is owned by Core Architecture and must carry a marker comment in src/domain`);
  }

  // A shim with no removal milestone is a permanent shim in disguise.
  for (const row of register) {
    check(/^wp-\d{2}$/.test(row.remove), `${row.id} names a removal milestone WP (received "${row.remove}")`);
  }

  // Expiry: a milestone that has already shipped must have been removed.
  // `COMPLETED_WPS` is the single place to record which WPs have landed; today
  // none has (no work package has been executed), so nothing can be expired.
  const COMPLETED_WPS: readonly string[] = [];
  for (const row of register) {
    if (COMPLETED_WPS.includes(row.remove)) {
      check(false, `${row.id} expired: its removal milestone ${row.remove.toUpperCase()} has shipped, so the shim must be deleted`);
    }
  }
});
