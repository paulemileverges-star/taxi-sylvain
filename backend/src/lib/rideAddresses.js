// Un seul endroit décide, pour une course ou une fiche, quelle adresse et quelles coordonnées
// sont enregistrées. Sans ce point unique, la création et la correction d'une course écriraient
// deux formes différentes de la même adresse (c'était le cas : la correction n'a jamais géocodé,
// donc la carte gardait l'ancien point).
import { prisma } from "./prisma.js";
import { geocodeAddress } from "./distance.js";
import { canonicalAddress, cleanAddressText } from "./addressFormat.js";

/**
 * Met une adresse à la forme unique de Taxi Sylvain et, si besoin, retrouve ses coordonnées.
 *
 * - coordonnées déjà connues (adresse choisie dans la liste de suggestions) : on ne rappelle pas
 *   OpenStreetMap, on se contente de nettoyer le texte ;
 * - coordonnées absentes : on géocode, ce que la création de course faisait déjà pour la distance.
 *
 * Ne lève jamais : une panne du service d'adresses ne doit pas empêcher d'enregistrer une course.
 */
export async function normaliserAdresse(texte, { zones = [], coords = null, geocoder = geocodeAddress } = {}) {
  if (!texte || !String(texte).trim()) return { address: null, coords: coords || null, avertissement: "adresse-vide" };

  const aDesCoords = coords && typeof coords.lat === "number" && typeof coords.lng === "number";
  if (aDesCoords) return { address: cleanAddressText(texte), coords, avertissement: null };

  let trouve = null;
  try {
    trouve = await geocoder(texte);
  } catch {
    trouve = null;
  }
  const r = canonicalAddress({ texte, geocode: trouve?.raw || null, zones });
  return {
    address: r.address,
    coords: trouve ? { lat: trouve.lat, lng: trouve.lng } : null,
    avertissement: r.avertissement,
    zoneTexte: r.zoneTexte,
    zoneForme: r.zoneForme,
  };
}

/** Les municipalités de la grille tarifaire, chargées une seule fois par requête. */
export function chargerZones() {
  return prisma.priceZone.findMany();
}
