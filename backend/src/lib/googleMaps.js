// Adresses par Google Maps (demande du propriétaire du 6 octobre 2026) : les adresses proposées et
// enregistrées doivent être de vraies adresses de Google Maps, la même base que celle qu'ouvre le
// chauffeur. Avant, tout passait par OpenStreetMap (gratuit) : codes postaux parfois faux, numéros
// civiques absents, points de guidage approximatifs.
//
// Actif seulement si GOOGLE_MAPS_API_KEY est posée (variables du service backend sur Railway, clé
// limitée à « Places API (New) » et « Geocoding API »). Sans clé, OpenStreetMap reste utilisé.
// Coût : sous les gratuités mensuelles de Google au volume de Taxi Sylvain (10 000 suggestions,
// 10 000 détails « Essentials » et 10 000 géocodages par mois) ; la clé n'est jamais envoyée aux
// applications, tout passe par le serveur.
import { codeProvince, uniteDeLAdresse, numeroTape } from "./addressFormat.js";

const DELAI_MS = 5000;
// Biais vers la grande région de Montréal et la Rive-Sud : une préférence, pas une limite.
const BIAIS = { circle: { center: { latitude: 45.5, longitude: -73.55 }, radius: 50000 } };

export function cleGoogle() {
  return process.env.GOOGLE_MAPS_API_KEY || "";
}
export function googleActif() {
  return Boolean(cleGoogle());
}

async function appel(url, options = {}, fetchImpl = fetch) {
  const res = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(DELAI_MS) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Maps ${res.status} : ${data?.error?.message || data?.error_message || "réponse refusée"}`);
  return data;
}

/** Composants d'adresse Google (Places « longText » ou Geocoding « long_name ») sous une forme unique. */
export function composants(liste = []) {
  return (liste || []).map((c) => ({
    long: c.longText ?? c.long_name ?? "",
    court: c.shortText ?? c.short_name ?? "",
    types: c.types || [],
  }));
}

const trouver = (comps, type) => comps.find((c) => c.types.includes(type)) || null;

/**
 * Adresse à la forme unique de Taxi Sylvain (« numéro + rue, ville, province + code postal »), à
 * partir des composants Google. Même règles que formatFromNominatim : l'appartement tapé est gardé,
 * la région n'est ajoutée que pour la ville de Québec (grille tarifaire), le pays seulement hors
 * Canada. `nomLieu` sert de tête d'adresse pour un lieu sans numéro civique.
 */
export function formeDepuisGoogle(liste, texteTape = "", nomLieu = null) {
  const comps = composants(liste);
  if (!comps.length) return null;
  const rue = trouver(comps, "route")?.long || null;
  const numero = trouver(comps, "street_number")?.long || (rue ? numeroTape(texteTape) : null);
  const sousLocal = trouver(comps, "subpremise")?.long || null;
  const unite = uniteDeLAdresse(texteTape) || (sousLocal ? `app. ${sousLocal}` : null);
  const voie = [numero, rue, unite].filter(Boolean).join(" ") || null;
  const ville =
    trouver(comps, "locality")?.long ||
    trouver(comps, "postal_town")?.long ||
    trouver(comps, "sublocality_level_1")?.long ||
    trouver(comps, "administrative_area_level_3")?.long ||
    null;
  const tete = voie || nomLieu || trouver(comps, "premise")?.long || trouver(comps, "establishment")?.long || null;
  const provinceComp = trouver(comps, "administrative_area_level_1");
  const province = provinceComp ? (/^[A-Z]{2}$/.test(provinceComp.court) ? provinceComp.court : codeProvince(provinceComp.long)) : null;
  // Ville de Québec : la grille tarifaire ne la reconnaît que suivie de sa région (pricing.js), que
  // Google ne nomme pas toujours ainsi : on l'écrit nous-mêmes.
  const region = ville && /^qu[ée]bec$/i.test(ville) && province === "QC" ? "Capitale-Nationale" : null;
  const postal = trouver(comps, "postal_code")?.long || null;
  const pays = trouver(comps, "country");
  const paysTexte = pays && pays.court && pays.court.toUpperCase() !== "CA" ? pays.long : null;
  const finale = [province, postal].filter(Boolean).join(" ") || null;
  const parts = [tete, ville, region, finale, paysTexte].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Précision d'un lieu Google, avec les mêmes niveaux que pour OpenStreetMap. */
export function precisionGoogle({ types = [], locationType = null } = {}) {
  if (locationType === "ROOFTOP" || locationType === "RANGE_INTERPOLATED") return "porte";
  if (types.some((t) => ["street_address", "premise", "subpremise", "establishment", "point_of_interest", "airport", "transit_station"].includes(t))) return "porte";
  if (locationType === "GEOMETRIC_CENTER" || types.includes("route") || types.includes("intersection")) return "rue";
  return "approx";
}

/** Suggestions pendant la frappe. Rend [{ placeId, label, nomLieu }]. */
export async function suggestions(texte, sessionToken, { fetchImpl } = {}) {
  const body = {
    input: texte,
    languageCode: "fr",
    regionCode: "ca",
    includedRegionCodes: ["ca", "us"],
    locationBias: BIAIS,
    ...(sessionToken ? { sessionToken } : {}),
  };
  const data = await appel("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": cleGoogle() },
    body: JSON.stringify(body),
  }, fetchImpl);
  return (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter((p) => p?.placeId)
    .map((p) => {
      const principal = p.structuredFormat?.mainText?.text || null;
      const label = p.text?.text || principal;
      // Un commerce ou un lieu (« Hôtel X ») : son nom aide à choisir, il n'entre pas dans l'adresse.
      const estUnLieu = (p.types || []).some((t) => ["establishment", "point_of_interest"].includes(t));
      return { placeId: p.placeId, label, nomLieu: estUnLieu ? principal : null };
    });
}

/** Détail d'un lieu choisi dans la liste : adresse à la forme unique, point exact. */
export async function detailsLieu(placeId, { sessionToken, texteTape = "", nomLieu = null, fetchImpl } = {}) {
  const params = new URLSearchParams({ languageCode: "fr", regionCode: "ca", ...(sessionToken ? { sessionToken } : {}) });
  // Champs de la catégorie « Essentials » seulement (le nom du lieu serait facturé « Pro ») : le nom
  // vient déjà de la suggestion.
  const data = await appel(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params}`, {
    headers: { "X-Goog-Api-Key": cleGoogle(), "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents,types" },
  }, fetchImpl);
  const forme = formeDepuisGoogle(data.addressComponents, texteTape, nomLieu) || data.formattedAddress || null;
  return {
    placeId: data.id || placeId,
    address: forme,
    lat: data.location?.latitude ?? null,
    lng: data.location?.longitude ?? null,
    confidence: precisionGoogle({ types: data.types || [] }),
  };
}

/** Géocodage d'une adresse tapée sans choisir dans la liste. Rend null si Google ne la trouve pas. */
export async function geocoderGoogle(texte, { fetchImpl } = {}) {
  const params = new URLSearchParams({ address: texte, region: "ca", language: "fr", key: cleGoogle() });
  const data = await appel(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, {}, fetchImpl);
  if (data.status === "ZERO_RESULTS") return null;
  if (data.status !== "OK") throw new Error(`Google Maps : ${data.status} ${data.error_message || ""}`.trim());
  const r = data.results?.[0];
  if (!r?.geometry?.location) return null;
  let confidence = precisionGoogle({ types: r.types || [], locationType: r.geometry.location_type });
  // Correspondance partielle : Google a deviné une partie de l'adresse, on ne guide pas sur ce point.
  if (r.partial_match && confidence === "porte" && r.geometry.location_type !== "ROOFTOP") confidence = "rue";
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    forme: formeDepuisGoogle(r.address_components, texte) || r.formatted_address || null,
    confidence,
    placeId: r.place_id || null,
    raw: null,
  };
}
