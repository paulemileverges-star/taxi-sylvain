// Règles de correction d'une course par le Dispatch (demande du propriétaire du 20 septembre 2026 :
// « toutes les modifications possibles doivent pouvoir se faire » depuis Courses et depuis la Cédule).
// Module pur, testé : la route PATCH /rides/:id (routes/rides.js) l'applique.

export const STATUTS_MODIFIABLES = ["REQUESTED", "BROADCAST", "ACCEPTED", "EN_ROUTE", "STARTED", "COMPLETED", "CANCELLED"];
const AVEC_CHAUFFEUR = ["ACCEPTED", "EN_ROUTE", "STARTED"];
const LIBELLE = {
  REQUESTED: "en attente", BROADCAST: "diffusée à tous", ACCEPTED: "acceptée", EN_ROUTE: "en route",
  STARTED: "démarrée", COMPLETED: "terminée", CANCELLED: "annulée", REFUSED: "refusée",
};

export function libelleStatut(status) {
  return LIBELLE[status] || status;
}

/**
 * Ce que change un statut imposé par le Dispatch. Renvoie { data } à enregistrer, ou { error }.
 * - une course acceptée, en route ou démarrée a forcément un chauffeur ;
 * - « en attente » et « diffusée » retirent le chauffeur ;
 * - chaque étape reçoit son horodatage, pour le suivi et le récap hebdomadaire (completedAt).
 */
export function changementDeStatut({ status, driverId, now = new Date() }) {
  if (!STATUTS_MODIFIABLES.includes(status)) return { error: "Statut invalide." };
  if (AVEC_CHAUFFEUR.includes(status) && !driverId) {
    return { error: `Choisissez d'abord un chauffeur pour passer la course à « ${libelleStatut(status)} ».` };
  }
  const data = { status };
  if (status === "REQUESTED" || status === "BROADCAST") data.driverId = null;
  if (status === "ACCEPTED") data.acceptedAt = now;
  if (status === "EN_ROUTE") data.enRouteAt = now;
  if (status === "STARTED") data.startedAt = now;
  if (status === "COMPLETED") data.completedAt = now;
  if (status === "CANCELLED") data.cancelledAt = now;
  return { data };
}

/** Un montant corrigé doit être un nombre positif ou nul (0 = « à confirmer »). */
export function montantValide(fare) {
  const n = Number(fare);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Texte de l'alerte envoyée à la console quand un statut est imposé à la main. */
export function texteChangementDeStatut({ auteur, ride, status }) {
  return `${auteur} a passé la course ${ride.pickupAddress} → ${ride.destAddress} à « ${libelleStatut(status)} ».`;
}
