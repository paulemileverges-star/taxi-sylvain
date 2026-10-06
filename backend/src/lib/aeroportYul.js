// Aéroport Montréal-Trudeau (YUL) : deux adresses seulement, à la demande du propriétaire du
// 6 octobre 2026, A les Arrivées et B le stationnement P4 (débarcadère Express, navette gratuite
// vers le terminal). Elles vivent dans le catalogue des destinations (codes YUL et YULP4, page
// Tarifs) ; seedDestinations.js les crée ou les corrige au démarrage.
//
// Points de guidage relevés le 6 octobre 2026 dans OpenStreetMap :
// - Arrivées : voie « Boulevard Roméo-Vachon Nord (arrivées) », devant le terminal ;
// - P4 : 590, boulevard Albert-De Niverville, Dorval, H4Y 0A4 (point d'adresse).
// L'ancien point de YUL (45.4706, -73.7408) était le centre des pistes : Google Maps menait le
// chauffeur sur la route la plus proche du milieu de l'aéroport.
import { normalize } from "./pricing.js";

export const CODES_YUL = ["YUL", "YULP4"];

export const YUL_ARRIVEES = {
  code: "YUL",
  label: "Aéroport Montréal-Trudeau (YUL) – Arrivées",
  address: "975 Boulevard Roméo-Vachon Nord (Arrivées), Dorval, QC H4Y 1H1",
  lat: 45.457445,
  lng: -73.750134,
  sortOrder: 1,
  pointVerified: true,
};

export const YUL_P4 = {
  code: "YULP4",
  label: "Aéroport Montréal-Trudeau (YUL) – Stationnement P4, débarcadère Express",
  address: "590 Boulevard Albert-De Niverville (Stationnement P4), Dorval, QC H4Y 0A4",
  lat: 45.4524039,
  lng: -73.7538016,
  sortOrder: 2,
  pointVerified: true,
};

/** Ancien point de YUL (centre de l'aéroport) : reconnu pour être remplacé une seule fois. */
export const ANCIEN_POINT_YUL = { lat: 45.4706, lng: -73.7408 };

// Une recherche vise YUL si elle le nomme, ou si elle parle d'« aéroport » sans en nommer un autre.
const AUTRES_AEROPORTS = /sainthubert|yhu|metropolitain|mirabel|jeanlesage|quebec|ottawa|plattsburgh|burlington|toronto/;

export function rechercheAeroportYul(q) {
  const n = normalize(q);
  if (!n) return false;
  if (/yul|trudeau|romeovachon|albertdeniverville|aeroportdorval|dorvalaeroport/.test(n)) return true;
  return /aeroport|airport/.test(n) && !AUTRES_AEROPORTS.test(n);
}
