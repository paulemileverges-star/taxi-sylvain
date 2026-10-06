// Distance de la prise en charge à la destination (besoin #7 du cahier des charges).
// Itinéraire routier via OSRM (OpenStreetMap, gratuit, sans clé) quand le service répond ;
// sinon distance à vol d'oiseau majorée de 30 % (approximation courante en ville). Best effort :
// une panne du service ne doit jamais empêcher la création d'une course.
function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function hasCoords(p) {
  return p && typeof p.lat === "number" && typeof p.lng === "number";
}

// Coordonnées d'une adresse saisie sans suggestion (ex. domicile du client) — Google Maps quand la
// clé est posée (6 octobre 2026), sinon Nominatim. Best effort : null si rien n'est trouvé.
// Google rend { lat, lng, forme, confidence, placeId } ; Nominatim { lat, lng, raw }.
export async function geocodeAddress(address) {
  if (!address || String(address).trim().length < 5) return null;
  const { googleActif, geocoderGoogle } = await import("./googleMaps.js");
  if (googleActif()) {
    try {
      return await geocoderGoogle(String(address).trim());
    } catch (e) {
      // Google indisponible ou clé refusée : on retombe sur OpenStreetMap plutôt que de ne rien avoir.
      console.error("Géocodage Google en échec, repli sur OpenStreetMap :", e.message);
    }
  }
  try {
    // addressdetails : sans lui, on ne récupère que la longue chaîne d'OpenStreetMap, alors que
    // la mise en forme unique des adresses a besoin des éléments séparés (numéro, rue, ville...).
    // Les abréviations (« Boul. », « N ») empêchent OpenStreetMap de trouver l'adresse : on les
    // écrit en toutes lettres avant d'appeler.
    const { expandAbbreviations } = await import("./addressFormat.js");
    const params = new URLSearchParams({ q: expandAbbreviations(address), format: "jsonv2", limit: "1", countrycodes: "ca,us", addressdetails: "1" });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "TaxiSylvain/1.0 (+https://taxisylvain.ca)" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const [first] = await res.json();
    return first ? { lat: parseFloat(first.lat), lng: parseFloat(first.lon), raw: first } : null;
  } catch {
    return null;
  }
}

// Avec des arrêts (6 octobre 2026), l'itinéraire passe par chacun dans l'ordre. Un arrêt sans
// coordonnées est sauté : la distance reste une estimation plutôt que de ne rien afficher.
export async function computeDistanceKm(pickup, dest, arrets = []) {
  if (!hasCoords(pickup) || !hasCoords(dest)) return null;
  const points = [pickup, ...arrets.filter(hasCoords), dest];
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${points.map((p) => `${p.lng},${p.lat}`).join(";")}?overview=false`;
    const res = await fetch(url, { headers: { "User-Agent": "TaxiSylvain/1.0 (+https://taxisylvain.ca)" }, signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const meters = data?.routes?.[0]?.distance;
      if (typeof meters === "number") return Math.round(meters / 100) / 10;
    }
  } catch {
    // repli ci-dessous
  }
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  return Math.round(km * 1.3 * 10) / 10;
}
