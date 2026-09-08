/**
 * Purity suite — static, and honestly labelled as static (ADR-000,
 * `docs/quality/invariant-register.md` §"Verification execution rules" §3).
 *
 * INV-015: `src/domain/**` must be pure. This is one of the few places where a
 * static assertion is the *only* possible verification — purity cannot be
 * proven by running the code.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { check, suite } from './harness';

const ROOT = new URL('../../', import.meta.url).pathname;
const DOMAIN_ROOT = join(ROOT, 'src/domain');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** Tokens that must never appear in the domain layer. */
const FORBIDDEN: readonly { readonly token: RegExp; readonly reason: string }[] = [
  { token: /\bfrom\s+['"]react['"]/, reason: 'React' },
  { token: /\bfrom\s+['"]react-dom['"]/, reason: 'react-dom' },
  { token: /\bfrom\s+['"]zustand['"]/, reason: 'zustand' },
  { token: /\bdocument\./, reason: 'DOM document' },
  { token: /\bwindow\./, reason: 'window' },
  { token: /\bnavigator\./, reason: 'navigator' },
  { token: /\bfetch\s*\(/, reason: 'fetch' },
  { token: /\bsetTimeout\s*\(/, reason: 'setTimeout' },
  { token: /\bsetInterval\s*\(/, reason: 'setInterval' },
  { token: /\brequestAnimationFrame\s*\(/, reason: 'requestAnimationFrame' },
  { token: /\blocalStorage\b/, reason: 'localStorage' },
  { token: /\bindexedDB\b/, reason: 'indexedDB' },
  { token: /\bMath\.random\s*\(/, reason: 'Math.random (non-deterministic)' },
  { token: /\bDate\.now\s*\(/, reason: 'Date.now (non-deterministic)' },
  { token: /\bnew\s+Date\b/, reason: 'new Date (non-deterministic)' },
  { token: /\bcrypto\./, reason: 'platform crypto (belongs in infra)' },
  { token: /\bprocess\.env\b/, reason: 'process.env (belongs in server/config)' },
];

export default suite('purity — src/domain is a pure layer (INV-015, static)', () => {
  const files = walk(DOMAIN_ROOT);
  check(files.length > 0, 'the domain layer exists and contains sources');

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    // Strip line comments and block comments so prose about a token is not a hit.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    for (const rule of FORBIDDEN) {
      check(!rule.token.test(code), `${relative(ROOT, file)} must not reference ${rule.reason}`);
    }

    // Dependency direction: the domain layer imports only itself.
    const imports = [...code.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)].map((m) => m[1] ?? '');
    for (const spec of imports) {
      const resolved = relative(ROOT, join(file, '..', spec));
      check(
        resolved.startsWith('src/domain/'),
        `${relative(ROOT, file)} must import only from src/domain (found ${spec})`,
      );
    }
  }
});
