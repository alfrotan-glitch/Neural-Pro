/**
 * Persistence infrastructure (WP-05, ADR-006).
 *
 * Layer rule (ADR-012): everything here may touch browser storage APIs and may
 * import `src/domain/**`; the domain layer never imports from here.
 */

export * from './errors';
export * from './integrity';
export * from './documentContract';
export * from './objectUrlTracker';
export * from './mediaProbe';
export * from './assetRegistryCore';
export * from './IndexedDbAssetRegistry';
export * from './indexedDbBackend';
export * from './memoryBackend';
export * from './projectDocumentStore';
export * from './mediaHydration';
export * from './migrateV1toV2';
export * from './transientMediaImporter';
export * from './uiPreferencesStore';
export * from './storageLifecycle';
export * from './projectBundle';
