import type { RenderSnapshotDiagnostic } from './renderSnapshotDiagnostics';
import type { RenderDiagnosticReplayPayload } from './renderDiagnosticReplay';

export const RENDER_DIAGNOSTIC_BUNDLE_SCHEMA_VERSION = 2 as const;
export const SUPPORTED_RENDER_DIAGNOSTIC_BUNDLE_SCHEMA_VERSIONS = [1, 2] as const;

export interface RenderDiagnosticBundleInput {
  readonly projectId: string;
  readonly projectTime: number;
  readonly previewHash: string;
  readonly exportHash: string;
  readonly equal: boolean;
  readonly previewOrigin: 'preview' | 'scrub' | 'seek';
  readonly exportOrigin: 'export';
  readonly diagnostic: RenderSnapshotDiagnostic;
  readonly formatted: string;
  readonly replay?: RenderDiagnosticReplayPayload;
}

export interface RenderDiagnosticBundle extends RenderDiagnosticBundleInput {
  readonly schemaVersion: typeof RENDER_DIAGNOSTIC_BUNDLE_SCHEMA_VERSION;
  readonly artifactType: 'video-studio.render-diagnostic';
}

function assertValid(input: RenderDiagnosticBundleInput): void {
  if (!input.projectId.trim()) throw new Error('Render diagnostic bundle requires projectId.');
  if (!Number.isFinite(input.projectTime) || input.projectTime < 0) {
    throw new Error(`Invalid render diagnostic projectTime: ${input.projectTime}`);
  }
  if (!input.previewHash || !input.exportHash) throw new Error('Render diagnostic bundle requires both snapshot hashes.');
}

/**
 * Creates a stable, JSON-safe diagnostic artifact. Runtime session identity and
 * timestamps are deliberately excluded so persisted artifacts remain reproducible.
 */
export function createRenderDiagnosticBundle(
  input: RenderDiagnosticBundleInput,
): RenderDiagnosticBundle {
  assertValid(input);
  return Object.freeze({
    schemaVersion: RENDER_DIAGNOSTIC_BUNDLE_SCHEMA_VERSION,
    artifactType: 'video-studio.render-diagnostic' as const,
    projectId: input.projectId,
    projectTime: input.projectTime,
    previewHash: input.previewHash,
    exportHash: input.exportHash,
    equal: input.equal,
    previewOrigin: input.previewOrigin,
    exportOrigin: input.exportOrigin,
    diagnostic: input.diagnostic,
    formatted: input.formatted,
    ...(input.replay ? { replay: input.replay } : {}),
  });
}

/** Stable persistence payload; JSON.stringify preserves insertion order of this schema. */
export function serializeRenderDiagnosticBundle(bundle: RenderDiagnosticBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function parseRenderDiagnosticBundle(serialized: string): RenderDiagnosticBundle {
  const parsed: unknown = JSON.parse(serialized);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid render diagnostic bundle payload.');
  const value = parsed as Partial<RenderDiagnosticBundle>;
  if (!(SUPPORTED_RENDER_DIAGNOSTIC_BUNDLE_SCHEMA_VERSIONS as readonly number[]).includes(Number(value.schemaVersion))) {
    throw new Error(`Unsupported render diagnostic bundle schema: ${String(value.schemaVersion)}`);
  }
  assertValid(value as RenderDiagnosticBundleInput);
  return Object.freeze(value as RenderDiagnosticBundle);
}

/**
 * Persistence adapter keeps filesystem/IndexedDB concerns outside the rendering core.
 * Callers can persist the exact serialized payload without mutating ProjectState.
 */
export interface RenderDiagnosticBundleStore {
  save(key: string, serializedBundle: string): void | Promise<void>;
  load(key: string): string | undefined | Promise<string | undefined>;
}

export async function saveRenderDiagnosticBundle(
  store: RenderDiagnosticBundleStore,
  key: string,
  bundle: RenderDiagnosticBundle,
): Promise<void> {
  await store.save(key, serializeRenderDiagnosticBundle(bundle));
}

export async function loadRenderDiagnosticBundle(
  store: RenderDiagnosticBundleStore,
  key: string,
): Promise<RenderDiagnosticBundle | undefined> {
  const serialized = await store.load(key);
  return serialized === undefined ? undefined : parseRenderDiagnosticBundle(serialized);
}
