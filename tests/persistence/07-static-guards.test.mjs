/**
 * Static guards for the persistence architecture.
 *
 * These complement the behavioural suites: they fail the moment a code path
 * reintroduces the mechanism behind D-006 (a browser-local handle becoming
 * durable state) or breaks the layer rule that keeps the domain testable.
 * They read source files, so they are labelled as static checks, not behaviour.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { report, suite, test } from './harness.mjs';

suite('static-guards');

const ROOT = new URL('../../', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const rel = (file) => relative(ROOT, file);
const read = (file) => readFileSync(file, 'utf8');

/** Finds real calls, ignoring the word appearing inside comments or strings. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

await test('no project-media code path mints an object URL outside the registry (D-006)', () => {
  const offenders = [];
  for (const file of files) {
    const path = rel(file);
    if (path === 'src/infra/persistence/objectUrlTracker.ts') continue;
    if (path === 'src/infra/persistence/transientMediaImporter.ts') continue; // documents the rule
    const code = stripComments(read(file));
    if (/URL\.createObjectURL\s*\(/.test(code)) {
      // Allowed only where the URL is a download/preview handle for a finished
      // render, never where it is written into clip properties.
      // Assignment only — `properties.videoUrl === 'x'` is a read, not a write.
      const writesIntoClipProperties = /properties\.\w*[Uu]rl\s*=(?!=)/.test(code);
      if (writesIntoClipProperties) offenders.push(path);
    }
  }
  assert.deepEqual(offenders, [], `clip properties must never receive a minted object URL: ${offenders.join(', ')}`);
});

await test('the timeline and resource sidebar no longer mint media URLs themselves', () => {
  for (const path of [
    'src/components/timeline/VirtualizedTimeline.tsx',
    'src/components/workspace/ResourceSidebar.tsx',
  ]) {
    const code = stripComments(read(join(ROOT, path)));
    assert.ok(!/URL\.createObjectURL\s*\(/.test(code), `${path} must not mint object URLs; the AssetRegistry owns that`);
  }
});

await test('project data is never written to localStorage', () => {
  const allowed = new Set([
    'src/infra/persistence/uiPreferencesStore.ts', // UI preferences only
    'src/components/inspector/panels/TextInspectorPanel.tsx', // text presets
    'src/components/inspector/InspectorEngine.tsx', // text presets (read)
    'src/components/timeline/VirtualizedTimeline.tsx', // timeline presets
    'src/features/video-studio/playback/components/RenderDiagnosticReplayViewer.tsx', // diagnostic bundles
    'src/features/video-studio/project/services/projectPersistenceService.ts', // SHIM-001 legacy reader
  ]);

  for (const file of files) {
    const path = rel(file);
    if (allowed.has(path)) continue;
    const code = stripComments(read(file));
    assert.ok(
      !/localStorage\.(setItem|getItem|removeItem)\s*\(/.test(code),
      `${path} touches localStorage; durable state belongs in IndexedDB (ADR-006)`,
    );
  }
});

await test('the domain layer stays pure (ADR-012)', () => {
  const forbidden = [
    [/\bwindow\b/, 'window'],
    [/\bdocument\b/, 'document'],
    [/\blocalStorage\b/, 'localStorage'],
    [/\bindexedDB\b/, 'indexedDB'],
    [/\bfetch\s*\(/, 'fetch'],
    [/from\s+'react'/, 'react import'],
    [/URL\.createObjectURL/, 'URL.createObjectURL'],
  ];

  for (const file of files) {
    const path = rel(file);
    if (!path.startsWith('src/domain/')) continue;
    const code = stripComments(read(file));
    for (const [pattern, label] of forbidden) {
      assert.ok(!pattern.test(code), `${path} must not reference ${label}`);
    }
  }
});

await test('the asset registry is the only place that revokes project media URLs', () => {
  for (const path of [
    'src/components/timeline/VirtualizedTimeline.tsx',
    'src/components/workspace/ResourceSidebar.tsx',
    'src/features/video-studio/project/services/projectSaveController.ts',
  ]) {
    const code = stripComments(read(join(ROOT, path)));
    assert.ok(
      !/URL\.revokeObjectURL\s*\(/.test(code),
      `${path} must not revoke media URLs directly; call the registry instead (INV-008)`,
    );
  }
});

await test('SHIM-001 is declared with an owner and a removal milestone', () => {
  const shim = read(join(ROOT, 'src/infra/persistence/migrateV1toV2.ts'));
  assert.match(shim, /SHIM_001_ID = 'SHIM-001'/);
  assert.match(shim, /SHIM_001_OWNER = 'WP-05'/);
  assert.match(shim, /SHIM_001_REMOVAL_MILESTONE = 'WP-12'/);
});

await test('persistence failure modes use stable machine-readable codes', () => {
  const errors = read(join(ROOT, 'src/infra/persistence/errors.ts'));
  for (const code of [
    'PERSISTENCE_CORRUPT',
    'PERSISTENCE_UNSUPPORTED_VERSION',
    'PERSISTENCE_QUOTA',
    'PERSISTENCE_TRANSIENT_REFERENCE',
    'PERSISTENCE_FAILED',
    'PERSISTENCE_CONFLICT',
    'ASSET_MISSING',
    'DEPENDENCY_UNAVAILABLE',
  ]) {
    assert.ok(errors.includes(`'${code}'`), `missing error code ${code}`);
  }
});

await test('sourceMediaDuration is only ever a MEASURED value, never a fallback (R3)', () => {
  // `sourceMediaDuration` is the field getCanonicalClipSourceDuration trusts as the
  // measured source length. Writing a guess into it (the previous project's
  // totalDuration, or a `?? clip.duration` fallback) launders that guess into every
  // duration authority and persists it — the mechanism behind D-024.
  const offenders = [];
  for (const file of files) {
    const path = rel(file);
    const code = stripComments(read(file));
    for (const line of code.split('\n')) {
      if (!/sourceMediaDuration\s*:/.test(line)) continue;
      const value = line.slice(line.indexOf('sourceMediaDuration'));
      const guessed =
        /\?\?/.test(value) ||
        /totalDuration/.test(value) ||
        /clip\.duration/.test(value) ||
        /\bstate\.duration\b/.test(value);
      if (guessed) offenders.push(`${path}: ${line.trim()}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `sourceMediaDuration must come from a measurement, not a fallback:\n${offenders.join('\n')}`,
  );
});

report('PERSISTENCE_STATIC_GUARDS');
