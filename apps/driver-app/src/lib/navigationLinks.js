// Liens Waze et Google Maps ouverts depuis une course — SOURCE UNIQUE, fonctions pures, sans
// aucun import : le fichier est testé tel quel par les tests du serveur.
//
// Pourquoi ce fichier existe : le chauffeur arrivait au mauvais endroit. Deux causes.
// 1. L'adresse envoyée était la longue chaîne d'OpenStreetMap, que Waze interprétait mal.
// 2. Le lien Waze portait « navigate=yes » : Waze lançait le guidage vers son PREMIER résultat de
//    recherche, sans montrer la liste, donc sans que le chauffeur puisse voir l'erreur.
//
// Règle retenue : on ne guide par coordonnées que si le point est vraiment celui de l'adresse
// (niveau « porte » ou point du catalogue « verifie »). Sinon on envoie l'adresse écrite, et on
// laisse le chauffeur confirmer dans Waze.

const COORDS_FIABLES = ["verifie", "porte"];

export function chooseTarget({ address, lat, lng, confidence } = {}) {
  const pointFiable = typeof lat === "number" && typeof lng === "number" && COORDS_FIABLES.includes(confidence);
  if (pointFiable) return { kind: "coords", value: `${lat},${lng}`, lat, lng };
  const texte = String(address || "").trim();
  if (texte) return { kind: "text", value: texte };
  if (typeof lat === "number" && typeof lng === "number") return { kind: "coords", value: `${lat},${lng}`, lat, lng };
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

export function buildGoogleMapsUrl(target, platform) {
  if (!target) return null;
  const destination = target.kind === "coords" ? target.value : encodeURIComponent(target.value);
  const natif = platform === "ios"
    ? `comgooglemaps://?daddr=${destination}&directionsmode=driving`
    : `google.navigation:q=${destination}`;
  return { natif, web: `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving` };
}

/** Ce qu'on affiche au chauffeur sous les boutons, pour qu'il sache à quoi s'attendre. */
export function navigationHint(target) {
  if (!target) return "Aucune adresse à ouvrir.";
  return target.kind === "coords"
    ? "Point exact : le guidage démarre directement."
    : "Adresse seulement — vérifiez le numéro civique dans Waze, appelez le client au besoin.";
}
