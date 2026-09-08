/** Collects the mounted media elements once at the beginning of an export. */
export function collectExportVideoElements(): ReadonlyMap<string, HTMLVideoElement> {
  const registry = new Map<string, HTMLVideoElement>();

  document
    .querySelectorAll<HTMLVideoElement>('[data-export-media-clip-id]')
    .forEach((element) => {
      const clipId = element.dataset.exportMediaClipId;
      if (!clipId) return;

      if (registry.has(clipId)) {
        throw new Error(
          `Multiple export video elements were registered for clip ${clipId}.`,
        );
      }

      registry.set(clipId, element);
    });

  return registry;
}
