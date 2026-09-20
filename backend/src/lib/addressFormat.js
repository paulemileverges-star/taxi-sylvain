// Forme unique des adresses de Taxi Sylvain :
//   « numéro + rue, ville, province + code postal »
// par exemple « 1580 Avenue Bourgogne, Chambly, QC J3L 2Y7 ».
//
// Pourquoi : les adresses venaient d'OpenStreetMap sous leur forme longue (quartier, MRC, région,
// pays), illisibles sur une carte de course, différentes d'un écran à l'autre, et surtout mal
// comprises par Waze et Google Maps quand le chauffeur les ouvrait.
//
// RÈGLE DE SÉCURITÉ ABSOLUE : le tarif du catalogue est calculé en LISANT le texte de l'adresse
// (voir pricing.js, matchZone). Réécrire une adresse peut donc changer le prix d'une course.
// canonicalAddress() refuse toute réécriture qui changerait la municipalité reconnue.
//
// Fichier pur : aucun réseau, aucune base de données, entièrement testable.

import { matchZone, normalize } from "./pricing.js";

const PROVINCE_CODES = {
  "québec": "QC", quebec: "QC", ontario: "ON",
  "nouveau-brunswick": "NB", "new brunswick": "NB",
  "nouvelle-écosse": "NS", "nova scotia": "NS",
  "île-du-prince-édouard": "PE", "prince edward island": "PE",
  "terre-neuve-et-labrador": "NL", "newfoundland and labrador": "NL",
  manitoba: "MB", saskatchewan: "SK", alberta: "AB",
  "colombie-britannique": "BC", "british columbia": "BC",
  "new york": "NY", vermont: "VT", maine: "ME", "new hampshire": "NH", massachusetts: "MA",
};

// Un segment d'adresse qui ne sert qu'à situer administrativement : il alourdit l'adresse et
// gêne Waze. On ne l'enlève jamais quand la ville est Québec (voir plus bas).
const SEGMENTS_ADMINISTRATIFS = /^(mrc|municipalit[ée] r[ée]gionale|communaut[ée] m[ée]tropolitaine|r[ée]gion|agglom[ée]ration|la vall[ée]e|le haut|le bas)\b/i;

const PREFIXES_VILLE = /^(city|town|village|municipality|ville|municipalit[ée])\s+(of|de|d')\s+/i;

/** « QC » à partir de « Québec », « NY » à partir de « New York ». Inconnu : renvoyé tel quel. */
export function codeProvince(nom) {
  if (!nom) return null;
  return PROVINCE_CODES[String(nom).trim().toLowerCase()] || String(nom).trim();
}

/**
 * Le complément d'unité tapé par la personne (app. 3, suite 200, bureau 12, #4).
 * Sans lui, cliquer une suggestion effaçait purement et simplement l'appartement du client.
 */
export function uniteDeLAdresse(texte) {
  const m = String(texte || "").match(/(?:^|[\s,])(app(?:t|artement)?\.?|apt\.?|unit[ée]?|unit|suite|bureau|#)\s*:?\s*([0-9]+[a-zA-Z]?|[a-zA-Z]-?[0-9]+)/i);
  if (!m) return null;
  const prefixe = m[1] === "#" ? "app." : m[1];
  return `${prefixe} ${m[2]}`.replace(/\s+/g, " ").trim();
}

/** Le numéro civique tapé en tête (« 1580 avenue… ») quand OpenStreetMap ne le connaît pas. */
export function numeroTape(texte) {
  return (String(texte || "").trim().match(/^(\d+[a-zA-Z]?)\b/) || [])[1] || null;
}

/**
 * Compose l'adresse à partir d'un résultat Nominatim.
 * Le nom du lieu (aéroport, station) n'est gardé QUE s'il n'y a pas de numéro civique : mis devant
 * une adresse civique, il fait reconnaître la mauvaise municipalité et change le prix facturé.
 */
export function formatFromNominatim(result, texteTape = "") {
  if (!result) return null;
  const a = result.address || {};
  const rue = a.road || a.pedestrian || a.footway || a.cycleway || null;
  const numero = a.house_number || (rue ? numeroTape(texteTape) : null);
  const unite = uniteDeLAdresse(texteTape);
  const voie = [numero, rue, unite].filter(Boolean).join(" ") || null;

  let ville = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || a.county || null;
  if (ville) ville = String(ville).replace(PREFIXES_VILLE, "").trim();

  // Le nom du lieu remplace la voie quand il n'y a pas d'adresse civique (station du REM,
  // aéroport). On ne le répète pas s'il redit la rue ou la ville.
  const nom = result.name && result.name !== rue && result.name !== ville ? result.name : null;
  const tete = voie || nom;

  // La ville de Québec n'est reconnue par la grille tarifaire que si sa région suit (sinon
  // « Québec » désigne la province). On garde donc la région dans ce seul cas.
  const region = normalize(ville) === "quebec" ? a.county || a.state_district || null : null;

  const province = codeProvince(a.state);
  const finale = [province, a.postcode].filter(Boolean).join(" ") || null;
  const pays = a.country_code && a.country_code.toLowerCase() !== "ca" ? a.country || null : null;

  const parts = [tete, ville, region, finale, pays].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/**
 * Nettoyage prudent d'une adresse déjà écrite, sans réseau : on enlève ce qui alourdit, jamais ce
 * qui identifie. Idempotent. Renvoie null pour une entrée vide.
 */
export function cleanAddressText(texte) {
  if (texte === null || texte === undefined) return null;
  let parts = String(texte).split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;

  // « Québec » désigne la province partout, SAUF quand sa région suit : c'est exactement la règle
  // qui fait reconnaître la ville de Québec dans la grille tarifaire (pricing.js). Dans ce seul
  // cas, on garde les segments administratifs, sinon la course Québec perdrait son tarif.
  const REGIONS_QUEBEC = ["capitalenationale", "agglomerationdequebec"];
  const contientQuebecVille = parts.some((p, i) => normalize(p) === "quebec" && REGIONS_QUEBEC.includes(normalize(parts[i + 1] || "")));
  parts = parts.filter((p, i) => {
    if (/^canada$/i.test(p)) return false;
    // « Québec » en avant-dernière position est la province : traité plus bas.
    if (SEGMENTS_ADMINISTRATIFS.test(p)) return contientQuebecVille;
    return true;
  });

  // Province écrite en toutes lettres → code court, et code postal recollé derrière.
  parts = parts.map((p) => {
    const code = PROVINCE_CODES[p.toLowerCase()];
    return code || p;
  });

  // « QC », « J3L 1Y8 » → « QC J3L 1Y8 »
  const POSTAL = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;
  for (let i = parts.length - 1; i > 0; i--) {
    if (POSTAL.test(parts[i]) && /^[A-Z]{2}$/.test(parts[i - 1])) {
      parts[i - 1] = `${parts[i - 1]} ${parts[i].toUpperCase()}`;
      parts.splice(i, 1);
    }
  }

  const resultat = parts.join(", ").replace(/\s+/g, " ").trim();
  return resultat || null;
}

/** Paramètres d'appel à OpenStreetMap, au même endroit pour la recherche et le géocodage. */
export function buildGeocodeParams({ q, limit = "5", countrycodes = "ca,us" }) {
  return new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    countrycodes,
    viewbox: "-79.8,45.0,-56.8,62.6", // Québec, grossièrement — biais, pas limite
    bounded: "0",
  });
}

/**
 * L'adresse à ENREGISTRER. Garde-fou tarifaire : si la forme propre ne désigne plus la même
 * municipalité que le texte d'origine, on garde le texte d'origine (nettoyé) et on signale.
 * Aucun prix ne peut donc changer à cause d'une mise en forme.
 */
export function canonicalAddress({ texte, geocode = null, zones = [] }) {
  const propre = cleanAddressText(texte);
  if (!geocode) return { address: propre, avertissement: propre ? null : "adresse-vide" };

  const forme = formatFromNominatim(geocode, texte || "");
  if (!forme) return { address: propre, avertissement: null };

  const zoneTexte = matchZone(texte, zones)?.name || null;
  const zoneForme = matchZone(forme, zones)?.name || null;
  if (zoneTexte !== zoneForme) {
    return { address: propre, avertissement: "zone-differente", zoneTexte, zoneForme };
  }
  return { address: forme, avertissement: zoneForme ? null : "ville-non-reconnue", zoneTexte, zoneForme };
}
