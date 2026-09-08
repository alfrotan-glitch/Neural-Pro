/**
 * @deprecated SHIM-002: ExportMediaRegistry has been superseded by ExportMediaPool.
 * Direct DOM scraping via querySelectorAll is strictly prohibited in the export runtime (INV-002).
 */
export function collectExportVideoElements(): ReadonlyMap<string, HTMLVideoElement> {
  return new Map<string, HTMLVideoElement>();
}
