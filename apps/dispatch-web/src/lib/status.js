import { heureMontrealVersIso, isoVersSaisieMontreal } from "./semaines.js";

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

// Convertit une valeur de <input type="datetime-local"> en instant UTC non ambigu pour le serveur.
// La saisie est une heure DE MONTRÉAL, jamais celle de l'ordinateur (audit du 7 octobre 2026, F03) :
// voir lib/semaines.js. Les deux noms restent ceux qu'utilisent déjà les pages.
export function localInputToIso(value) {
  return heureMontrealVersIso(value);
}

// Inverse : instant UTC -> valeur d'un <input type="datetime-local">, à l'heure de Montréal.
export function isoToLocalInput(iso) {
  return isoVersSaisieMontreal(iso);
}
