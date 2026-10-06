// Rapports des courses par chauffeur : récap hebdomadaire, « Mes rapports », page Rapports du
// Dispatch, exports PDF et Excel. UNE SEULE règle de calcul pour tous (6 octobre 2026).
//
// Ce qui était faux avant (signalé par le propriétaire : « le rapport n'est pas toujours correct »,
// une seule semaine conforme au tableau de Sylvain sur trois) :
// 1. Une course comptait dans la semaine où le chauffeur avait appuyé sur « Terminer », et non dans
//    celle de la course. Une course terminée en retard, ou corrigée plus tard par le Dispatch,
//    changeait de semaine ou disparaissait. Sylvain, lui, compte par date de la course.
// 2. Le récap du lundi était figé : une course terminée ou corrigée après le lundi ne le changeait
//    plus, sauf régénération manuelle, qui renvoyait alors une notification à chaque clic.
// 3. Les dates des exports PDF et Excel étaient calculées à l'heure du serveur (UTC) : la semaine
//    du 21 au 27 s'affichait « du 21 au 28 ».
//
// Règle désormais : la date d'une course est l'heure de prise en charge prévue (sinon l'heure de
// création, pour une course immédiate), à l'heure du Québec. Une course compte dans les montants
// et la redevance quand elle est « Effectuée » ; les courses encore à faire sont listées à part ;
// les annulées ne comptent nulle part. Les chiffres sont recalculés à chaque lecture : une
// correction du Dispatch se voit tout de suite partout.
//
// Fichier pur : aucune base, aucun réseau, entièrement testable.
import { rideMoment } from "./ridesOrder.js";
import { mondayOf, decalerSemaine, jourQuebec, heureQuebec } from "./semaines.js";

export const STATUT_EFFECTUEE = "COMPLETED";
export const STATUTS_A_EFFECTUER = ["REQUESTED", "BROADCAST", "ACCEPTED", "EN_ROUTE", "STARTED"];
export const STATUTS_ANNULES = ["CANCELLED", "REFUSED"];

export const LIBELLES_STATUT = {
  REQUESTED: "En attente",
  BROADCAST: "Diffusée",
  ACCEPTED: "Acceptée",
  EN_ROUTE: "En route",
  STARTED: "En cours",
  COMPLETED: "Effectuée",
  CANCELLED: "Annulée",
  REFUSED: "Refusée",
};

const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Filtre Prisma : courses dont la date (prise en charge prévue, sinon création) tombe dans la période. */
export function filtrePeriode(from, to) {
  return {
    OR: [
      { scheduledFor: { gte: from, lte: to } },
      { scheduledFor: null, createdAt: { gte: from, lte: to } },
    ],
  };
}

/** La municipalité d'une adresse à la forme unique (« 12 Rue X, Chambly, QC J3L 1Y8 » → « Chambly »). */
export function villeDe(adresse) {
  const parts = String(adresse || "").split(",").map((p) => p.trim()).filter(Boolean);
  // « QC J3L 1Y8 », « NY 12901 » : la province et le code postal, jamais la ville.
  const estProvince = (p) => /^[A-Z]{2}(\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d|\d{5}))?$/.test(p);
  if (parts.length >= 2) return estProvince(parts[1]) ? "" : parts[1];
  return parts.length === 1 && !estProvince(parts[0]) ? parts[0] : "";
}

/** Une ligne de rapport pour une course. */
export function ligneCourse(ride) {
  const t = rideMoment(ride);
  const effectuee = ride.status === STATUT_EFFECTUEE;
  const montant = cents(ride.fare);
  return {
    id: ride.id,
    moment: t === null ? null : new Date(t).toISOString(),
    date: t === null ? "" : jourQuebec(t),
    heure: t === null ? "" : heureQuebec(t),
    statut: ride.status,
    statutLibelle: LIBELLES_STATUT[ride.status] || ride.status,
    effectuee,
    client: ride.client?.name || null,
    depart: ride.pickupAddress,
    ville: villeDe(ride.pickupAddress),
    destination: ride.destAddress,
    arrets: Array.isArray(ride.stops) ? ride.stops.filter((a) => a && a.address).map((a) => a.address) : [],
    montant,
    redevance: effectuee ? cents(montant * (typeof ride.royaltyRate === "number" ? ride.royaltyRate : 0.1)) : 0,
  };
}

/** Totaux d'une liste de lignes : effectuées (montant, redevance) et à effectuer. */
export function totaux(lignes) {
  const t = { effectuees: { nombre: 0, montant: 0, redevance: 0 }, aEffectuer: { nombre: 0, montant: 0 } };
  for (const l of lignes) {
    if (l.effectuee) {
      t.effectuees.nombre += 1;
      t.effectuees.montant += l.montant;
      t.effectuees.redevance += l.redevance;
    } else if (STATUTS_A_EFFECTUER.includes(l.statut)) {
      t.aEffectuer.nombre += 1;
      t.aEffectuer.montant += l.montant;
    }
  }
  t.effectuees.montant = cents(t.effectuees.montant);
  t.effectuees.redevance = cents(t.effectuees.redevance);
  t.aEffectuer.montant = cents(t.aEffectuer.montant);
  return t;
}

const parMoment = (a, b) => String(a.moment || "").localeCompare(String(b.moment || "")) || String(a.id).localeCompare(String(b.id));

/**
 * Rapport d'une période, classé par chauffeur (page Rapports du Dispatch, exports) : toutes les
 * courses affectées, effectuées ou à effectuer, avec les totaux de chacun ; puis les courses sans
 * chauffeur ; les annulées sont seulement comptées.
 */
export function rapportPeriode(rides) {
  const chauffeurs = new Map();
  const nonAssignees = [];
  let annulees = 0;
  for (const ride of rides || []) {
    if (STATUTS_ANNULES.includes(ride.status)) { annulees += 1; continue; }
    const ligne = ligneCourse(ride);
    if (!ride.driverId) { nonAssignees.push(ligne); continue; }
    if (!chauffeurs.has(ride.driverId)) chauffeurs.set(ride.driverId, { chauffeur: { id: ride.driverId, name: ride.driver?.name || "Chauffeur" }, courses: [] });
    chauffeurs.get(ride.driverId).courses.push(ligne);
  }
  const blocs = [...chauffeurs.values()]
    .map((b) => ({ ...b, courses: b.courses.sort(parMoment), ...totaux(b.courses) }))
    .sort((a, b) => a.chauffeur.name.localeCompare(b.chauffeur.name, "fr", { sensitivity: "base" }));
  const toutes = [...blocs.flatMap((b) => b.courses), ...nonAssignees];
  return {
    chauffeurs: blocs,
    nonAssignees: { courses: nonAssignees.sort(parMoment), ...totaux(nonAssignees) },
    annulees,
    general: totaux(toutes),
  };
}

/**
 * Récaps hebdomadaires d'un chauffeur (« Mes rapports ») : ses courses effectuées regroupées par
 * semaine de la date de la course, pour les semaines terminées (avant `avant`), la plus récente
 * en premier. Même forme qu'avant le 6 octobre 2026 : les applications déjà installées les lisent.
 */
export function recapsHebdomadaires(rides, { avant = mondayOf(new Date()) } = {}) {
  const semaines = new Map();
  for (const ride of rides || []) {
    if (ride.status !== STATUT_EFFECTUEE) continue;
    const t = rideMoment(ride);
    if (t === null || t >= new Date(avant).getTime()) continue;
    const debut = mondayOf(new Date(t));
    const cle = debut.toISOString();
    if (!semaines.has(cle)) semaines.set(cle, { weekStart: debut, weekEnd: new Date(decalerSemaine(debut, 1).getTime() - 1), lignes: [] });
    semaines.get(cle).lignes.push(ligneCourse(ride));
  }
  return [...semaines.values()]
    .map((s) => {
      const t = totaux(s.lignes);
      return { weekStart: s.weekStart, weekEnd: s.weekEnd, rideCount: t.effectuees.nombre, totalFare: t.effectuees.montant, royaltyDue: t.effectuees.redevance };
    })
    .sort((a, b) => b.weekStart - a.weekStart);
}
