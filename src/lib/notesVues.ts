/**
 * Badge « Nouveau patch » : il s'affiche si la dernière annonce d'un jeu est plus
 * récente que la dernière fois où ses notes ont été ouvertes (gardé sur ce PC).
 */
const cle = (appId: number) => `resteam.notes-vues.${appId}`;

export function notesVuesLe(appId: number): number {
  try {
    return Number(localStorage.getItem(cle(appId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function marquerNotesVues(appId: number, date: number) {
  try {
    localStorage.setItem(cle(appId), String(date));
  } catch {
    /* stockage indisponible : le badge reviendra, sans gravité */
  }
}
