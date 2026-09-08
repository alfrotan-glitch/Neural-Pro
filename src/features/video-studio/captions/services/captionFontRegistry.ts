const GOOGLE_FONT_LINK_ID = 'video-studio-caption-google-fonts';
const GOOGLE_FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Pacifico&family=Playpen+Sans:wght@700&display=swap';

let linkPromise: Promise<HTMLLinkElement> | null = null;
const loadedFamilies = new Set<string>();

function ensureGoogleFontStylesheet(): Promise<HTMLLinkElement> {
  if (linkPromise) return linkPromise;

  linkPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('CaptionFontRegistry requires a browser document.'));
      return;
    }

    const existing = document.getElementById(GOOGLE_FONT_LINK_ID) as HTMLLinkElement | null;
    if (existing) {
      if (existing.sheet) {
        resolve(existing);
        return;
      }
      existing.addEventListener('load', () => resolve(existing), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load caption font stylesheet.')), { once: true });
      return;
    }

    const link = document.createElement('link');
    link.id = GOOGLE_FONT_LINK_ID;
    link.rel = 'stylesheet';
    link.href = GOOGLE_FONT_HREF;
    link.addEventListener('load', () => resolve(link), { once: true });
    link.addEventListener('error', () => reject(new Error('Failed to load caption font stylesheet.')), { once: true });
    document.head.appendChild(link);
  });

  return linkPromise;
}

export async function ensureCaptionFont(family: string | undefined): Promise<void> {
  const normalized = family?.trim();
  if (!normalized || typeof document === 'undefined' || !('fonts' in document)) return;

  const baseFamily = normalized.replace(/^['"]|['"]$/g, '').split(',')[0]?.trim() ?? '';
  if (!baseFamily || loadedFamilies.has(baseFamily)) return;

  try {
    await ensureGoogleFontStylesheet();
    await document.fonts.load(`700 32px "${baseFamily}"`);
    loadedFamilies.add(baseFamily);
  } catch {
    // Font loading is progressive enhancement; the CSS fallback chain remains valid.
  }
}

export function preloadCaptionFonts(): void {
  if (typeof document === 'undefined') return;
  void ensureGoogleFontStylesheet().catch(() => undefined);
}
