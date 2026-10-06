// Liens Waze et Google Maps ouverts depuis une course — SOURCE UNIQUE, fonctions pures, sans
// aucun import : le fichier est testé tel quel par les tests du serveur.
//
// Pourquoi ce fichier existe : le chauffeur arrivait au mauvais endroit. Deux causes.
// 1. L'adresse envoyée était la longue chaîne d'OpenStreetMap, que Waze interprétait mal.
// 2. Le lien Waze portait « navigate=yes » : Waze lançait le guidage vers son PREMIER résultat de
//    recherche, sans montrer la liste, donc sans que le chauffeur puisse voir l'erreur.
//
// 6 octobre 2026 : Google Maps menait encore parfois ailleurs que l'adresse affichée. Le point
// enregistré venait d'OpenStreetMap et pouvait différer de l'adresse écrite, et le point de
// l'aéroport YUL était le centre des pistes. Règles désormais :
// - Google Maps reçoit l'ADRESSE ÉCRITE, celle que le chauffeur lit à l'écran, avec l'identifiant
//   Google du lieu quand il est connu ; des coordonnées seulement pour un point du catalogue
//   vérifié (YUL Arrivées, stationnement P4, REM) ;
// - Waze, dont la recherche par texte est moins fiable, guide par coordonnées sur un point sûr
//   (« porte » ou « verifie »), sinon il montre les résultats de la recherche ;
// - avec des arrêts, un lien Google Maps donne tout l'itinéraire, arrêts compris.

const COORDS_FIABLES = { waze: ["verifie", "porte"], google: ["verifie"] };

/**
 * Ce qu'on envoie à l'application de navigation : des coordonnées ou l'adresse écrite.
 * `appli` : « waze » (par défaut) ou « google ».
 */
export function chooseTarget({ address, lat, lng, confidence, placeId } = {}, appli = "waze") {
  const aDesCoords = typeof lat === "number" && typeof lng === "number";
  const identifiant = typeof placeId === "string" && placeId ? placeId : null;
  const fiables = COORDS_FIABLES[appli] || COORDS_FIABLES.waze;
  if (aDesCoords && fiables.includes(confidence)) return { kind: "coords", value: `${lat},${lng}`, lat, lng, placeId: identifiant };
  const texte = String(address || "").trim();
  if (texte) return { kind: "text", value: texte, placeId: identifiant };
  if (aDesCoords) return { kind: "coords", value: `${lat},${lng}`, lat, lng, placeId: identifiant };
  return null;
}

export function buildWazeUrl(target) {
  if (!target) return null;
  if (target.kind === "coords") {
    return { natif: `waze://?ll=${target.value}&navigate=yes`, web: `https://waze.com/ul?ll=${encodeURIComponent(target.value)}&navigate=yes` };
  }
  // Pas de « navigate=yes » sur une recherche par texte : le chauffeur voit les résultats et
  // choisit, au lieu d'être lancé vers une devinette.
  const q = encodeURIComponent(target.value);
  return { natif: `waze://?q=${q}`, web: `https://waze.com/ul?q=${q}` };
}

const encoder = (t) => (t.kind === "coords" ? t.value : encodeURIComponent(t.value));

/**
 * Lien Google Maps vers `target`, en passant par les `etapes` (arrêts) dans l'ordre. Avec des
 * étapes, l'application Google Maps s'ouvre par le lien https, seul à accepter plusieurs arrêts.
 */
export function buildGoogleMapsUrl(target, platform, etapes = []) {
  if (!target) return null;
  const destination = encoder(target);
  const params = ["api=1", `destination=${destination}`, "travelmode=driving"];
  if (target.placeId) params.push(`destination_place_id=${encodeURIComponent(target.placeId)}`);
  const passages = (etapes || []).filter(Boolean);
  if (passages.length) {
    params.push(`waypoints=${passages.map(encoder).join("%7C")}`);
    if (passages.every((e) => e.placeId)) params.push(`waypoint_place_ids=${passages.map((e) => encodeURIComponent(e.placeId)).join("%7C")}`);
    params.push("dir_action=navigate");
  }
  const web = `https://www.google.com/maps/dir/?${params.join("&")}`;
  if (passages.length) return { natif: web, web };
  const natif = platform === "ios"
    ? `comgooglemaps://?daddr=${destination}&directionsmode=driving`
    : `google.navigation:q=${destination}`;
  return { natif, web };
}

/** Ce qu'on affiche au chauffeur sous les boutons, pour qu'il sache à quoi s'attendre. */
export function navigationHint(target) {
  if (!target) return "Aucune adresse à ouvrir.";
  return target.kind === "coords"
    ? "Point exact : le guidage démarre directement."
    : "Adresse seulement — vérifiez le numéro civique dans Waze, appelez le client au besoin.";
}

/**
 * Étapes de navigation d'une course, dans l'ordre : vers le client avant le départ ; une fois la
 * course démarrée, chaque arrêt puis la destination. Rend [{ titre, point }].
 */
export function etapesDeNavigation(ride) {
  if (!ride) return [];
  const point = (adresse, lat, lng, confidence, placeId) => ({ address: adresse, lat, lng, confidence, placeId });
  if (ride.status !== "STARTED") {
    return [{ titre: "Prise en charge du client", point: point(ride.pickupAddress, ride.pickupLat, ride.pickupLng, ride.pickupConfidence, ride.pickupPlaceId) }];
  }
  const arrets = Array.isArray(ride.stops) ? ride.stops.filter((a) => a && a.address) : [];
  return [
    ...arrets.map((a, i) => ({ titre: `Arrêt ${i + 1}`, point: point(a.address, a.lat, a.lng, a.confidence, a.placeId) })),
    { titre: "Destination", point: point(ride.destAddress, ride.destLat, ride.destLng, ride.destConfidence, ride.destPlaceId) },
  ];
}
