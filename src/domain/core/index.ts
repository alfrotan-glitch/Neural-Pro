/**
 * Canonical Core — the single source of truth for Neural-Pro's domain primitives.
 *
 * Layer L2 (ADR-012). PURE by construction:
 *   no React · no DOM · no fetch · no timers · no storage · no Math.random · no Date.now.
 *
 * Everything in this directory is deterministic and therefore executable-testable.
 *
 * Adoption rule (ADR-017): every module under `src/domain/**`, and every
 * feature module that currently redefines one of these concepts, imports from
 * here. If a concept needs to change, it changes here — once.
 */

export * from './errors';
export * from './identity';
export * from './fps';
export * from './time';
export * from './duration';
export * from './geometry';
export * from './transform';
export * from './clip';
export * from './track';
export * from './project';
export * from './validation';
