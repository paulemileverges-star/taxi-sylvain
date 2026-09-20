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

// Coordonnées d'une adresse saisie sans suggestion (ex. domicile du client) — Nominatim, best effort.
export async function geocodeAddress(address) {
  if (!address || String(address).trim().length < 5) return null;
  try {
    // addressdetails : sans lui, on ne récupère que la longue chaîne d'OpenStreetMap, alors que
    // la mise en forme unique des adresses a besoin des éléments séparés (numéro, rue, ville...).
    const params = new URLSearchParams({ q: address, format: "jsonv2", limit: "1", countrycodes: "ca,us", addressdetails: "1" });
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

export async function computeDistanceKm(pickup, dest) {
  if (!hasCoords(pickup) || !hasCoords(dest)) return null;
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${dest.lng},${dest.lat}?overview=false`;
    const res = await fetch(url, { headers: { "User-Agent": "TaxiSylvain/1.0 (+https://taxisylvain.ca)" }, signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      const meters = data?.routes?.[0]?.distance;
      if (typeof meters === "number") return Math.round(meters / 100) / 10;
    }
  } catch {
    // repli ci-dessous
  }
  return Math.round(haversineKm(pickup, dest) * 1.3 * 10) / 10;
}
