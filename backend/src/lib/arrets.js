// Arrêts d'une course entre la prise en charge et la destination (demande du propriétaire du
// 6 octobre 2026) : « je prends mon client chez lui, puis son ami, puis l'aéroport YUL ». Avant,
// une course n'avait que deux adresses et il fallait bricoler.
//
// Stockage : champ JSON Ride.stops, liste ordonnée de { address, lat, lng, confidence, placeId }.
// Chaque arrêt passe par la même mise en forme et le même géocodage que les autres adresses
// (rideAddresses.js), donc la même règle de guidage (navigationLinks.js).
import { normaliserAdresse } from "./rideAddresses.js";

export const MAX_ARRETS = 5;

export class ArretsInvalides extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const nombre = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texte = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Lecture stricte de ce qu'envoie la console. Les lignes vides sont ignorées. */
export function lireArrets(brut) {
  if (brut === undefined || brut === null) return [];
  if (!Array.isArray(brut)) throw new ArretsInvalides("Les arrêts doivent être une liste.");
  const arrets = [];
  for (const a of brut) {
    const address = texte(typeof a === "string" ? a : a?.address, 300);
    if (!address) continue;
    arrets.push({
      address,
      lat: nombre(a?.lat),
      lng: nombre(a?.lng),
      confidence: texte(a?.confidence, 20),
      placeId: texte(a?.placeId, 300),
    });
  }
  if (arrets.length > MAX_ARRETS) throw new ArretsInvalides(`Une course compte ${MAX_ARRETS} arrêts au plus.`);
  return arrets;
}

/** Arrêts mis à la forme unique, avec leurs coordonnées (géocodées si la console n'en a pas). */
export async function normaliserArrets(brut, { zones = [], geocoder } = {}) {
  const sortie = [];
  for (const a of lireArrets(brut)) {
    const coords = a.lat !== null && a.lng !== null ? { lat: a.lat, lng: a.lng, confidence: a.confidence } : null;
    const r = await normaliserAdresse(a.address, { zones, coords, ...(geocoder ? { geocoder } : {}) });
    sortie.push({
      address: r.address || a.address,
      lat: r.coords?.lat ?? null,
      lng: r.coords?.lng ?? null,
      confidence: r.confidence || null,
      placeId: coords ? a.placeId : null,
    });
  }
  return sortie;
}

/** Arrêts d'une course enregistrée (champ JSON), toujours une liste. */
export function arretsDe(ride) {
  return Array.isArray(ride?.stops) ? ride.stops.filter((a) => a && typeof a.address === "string" && a.address.trim()) : [];
}

/** « Départ → Destination (+2 arrêts) » : notifications et listes courtes. */
export function trajetCourt(ride) {
  const n = arretsDe(ride).length;
  return `${ride.pickupAddress} → ${ride.destAddress}${n ? ` (+${n} arrêt${n > 1 ? "s" : ""})` : ""}`;
}

/** Points de passage dans l'ordre, pour la distance : départ, arrêts, destination. */
export function pointsDuTrajet(pickup, dest, arrets = []) {
  return [pickup, ...arrets.map((a) => ({ lat: a.lat, lng: a.lng })), dest];
}
