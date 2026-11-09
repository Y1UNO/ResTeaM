/**
 * Dans l'exe, les images de Steam passent par le cache disque de ResTeaM
 * (`http://img.localhost/…`, voir `images_locales.rs`) : téléchargées une fois,
 * puis lues sur le disque. Dans l'aperçu navigateur, l'adresse reste directe.
 */
const DANS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function viaCache<T extends string | null | undefined>(url: T): T {
  if (!DANS_TAURI || !url || !url.startsWith("https://") || url.includes("video.")) return url;
  return `http://img.localhost/${encodeURIComponent(url)}` as T;
}
