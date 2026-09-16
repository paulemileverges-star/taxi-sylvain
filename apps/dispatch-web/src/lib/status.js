// Libellés et couleurs des statuts de course, partagés par toutes les pages du Dispatch.
export const STATUS_LABEL = {
  REQUESTED: "En attente",
  BROADCAST: "En attente — diffusée à tous",
  ACCEPTED: "Acceptée — en attente du départ",
  EN_ROUTE: "En route — prise en charge",
  STARTED: "En route — destination",
  COMPLETED: "Effectuée",
  CANCELLED: "Annulée",
  REFUSED: "Refusée",
};

// Classe CSS (voir App.css .status-*) — même code couleur partout : gris = en attente,
// ambre = vers le client, bleu = vers la destination, vert = effectuée, rouge = annulée.
export function statusClass(status) {
  return `status-${status || "REQUESTED"}`;
}

// Convertit une valeur de <input type="datetime-local"> (heure locale du navigateur, sans fuseau)
// en instant UTC non ambigu pour le serveur — sinon le serveur (en UTC) la réinterprète et
// l'heure affichée aux chauffeurs est décalée de 4 à 5 heures.
export function localInputToIso(value) {
  return value ? new Date(value).toISOString() : null;
}

// Inverse : instant UTC -> valeur locale pour pré-remplir un <input type="datetime-local">.
export function isoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
