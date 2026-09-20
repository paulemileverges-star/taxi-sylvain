import { prisma } from "./prisma.js";

// Reconnaît la municipalité de prise en charge dans une adresse (saisie libre ou suggestion
// OpenStreetMap) et renvoie le tarif du catalogue vers la destination demandée.
export function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// « Québec » désigne la province dans presque toutes les adresses : on ne retient la ville de
// Québec que si la partie suivante est sa région (Capitale-Nationale).
const QUEBEC_CITY_REGIONS = ["capitalenationale", "agglomerationdequebec"];

export function matchZone(address, zones) {
  const parts = String(address || "").split(",").map((p) => normalize(p)).filter(Boolean);
  const byKey = new Map(zones.map((z) => [normalize(z.name), z]));

  // 1. Une partie de l'adresse est exactement une municipalité connue (de gauche à droite :
  //    la ville précède toujours la région et la province).
  for (let i = 0; i < parts.length; i++) {
    const zone = byKey.get(parts[i]);
    if (!zone) continue;
    if (parts[i] === "quebec" && !QUEBEC_CITY_REGIONS.includes(parts[i + 1])) continue;
    return zone;
  }

  // 2. Sinon, la municipalité est contenue dans l'adresse (« Vieux-Longueuil », « 12 rue X Chambly QC ») :
  //    on prend la plus longue correspondance pour préférer « Saint-Jean-sur-Richelieu » à « Saint-Jean ».
  const whole = normalize(address);
  let best = null;
  for (const [key, zone] of byKey) {
    if (key === "quebec" || key.length < 5) continue;
    if (whole.includes(key) && (!best || key.length > best.key.length)) best = { key, zone };
  }
  return best ? best.zone : null;
}

// Un montant saisi dans un formulaire ou lu dans un fichier importé. Vide, zéro, négatif ou
// illisible donnent null : un prix ne peut jamais valoir zéro, sinon la course devient gratuite.
// Règle unique du projet : la page Tarifs, les destinations et les fiches clients l'utilisent tous.
export function parsePrice(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const CHAMP_PRIX = { YUL: "priceYUL", YHU: "priceYHU", REM: "priceREM" };
const valide = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * Tarif applicable, dans cet ordre : prix négocié avec le client, puis grille de sa municipalité,
 * puis prix de repli de la destination. Un zéro trouvé en base est ignoré à chaque étape.
 * L'appel à deux arguments reste valable (aucun prix client).
 */
export function priceFor(destination, zone, clientPrices) {
  if (!destination) return null;
  const champ = CHAMP_PRIX[destination.code];
  for (const candidat of [clientPrices?.[champ], zone?.[champ], destination.price]) {
    if (valide(candidat)) return candidat;
  }
  return null;
}

/** D'où vient le prix affiché : « client », « zone », « destination », ou null si aucun. */
export function priceSource(destination, zone, clientPrices) {
  if (!destination) return null;
  const champ = CHAMP_PRIX[destination.code];
  if (valide(clientPrices?.[champ])) return "client";
  if (valide(zone?.[champ])) return "zone";
  if (valide(destination.price)) return "destination";
  return null;
}

// Tarifs d'une adresse de départ vers toutes les destinations d'un coup (données déjà chargées) —
// utilisé pour afficher les 3 prix sur chaque fiche client sans multiplier les requêtes.
export function quoteAll(pickupAddress, destinations, zones, clientPrices) {
  const zone = matchZone(pickupAddress, zones);
  const prices = {};
  const sources = {};
  for (const d of destinations) {
    prices[d.code] = priceFor(d, zone, clientPrices);
    sources[d.code] = priceSource(d, zone, clientPrices);
  }
  return { prices, zoneName: zone?.name || null, sources };
}

/**
 * Ce qu'il faut écrire en base pour les trois prix négociés d'un client.
 * - champ absent de la requête : on n'y touche pas ;
 * - champ vide : le prix est effacé, la grille reprend la main ;
 * - sinon : montant contrôlé par parsePrice.
 * Si la personne n'a pas le droit de fixer les prix et qu'elle en change un, on refuse
 * franchement (forbidden) au lieu d'ignorer sa saisie en silence.
 */
export function clientPriceData(body = {}, existing = {}, peutModifierLesPrix = false) {
  const data = {};
  let forbidden = false;
  for (const champ of Object.values(CHAMP_PRIX)) {
    if (body[champ] === undefined) continue;
    const valeur = body[champ] === "" || body[champ] === null ? null : parsePrice(body[champ]);
    const actuel = existing?.[champ] ?? null;
    if (valeur === actuel) continue; // ré-enregistrer une fiche sans rien changer n'est pas une modification
    if (!peutModifierLesPrix) { forbidden = true; continue; }
    data[champ] = valeur;
  }
  return { data, forbidden };
}

// Renvoie { price, zoneName, destination, source, zonePrice } — price null si aucun tarif.
// zonePrice est le prix qu'aurait donné la grille : il permet d'afficher la différence quand un
// prix négocié s'applique, pour que personne ne facture un prix négocié sans le voir.
export async function quote({ pickupAddress, destinationCode, clientId }) {
  if (!destinationCode) return { price: null, zoneName: null, destination: null, source: null, zonePrice: null };
  const destination = await prisma.destination.findUnique({ where: { code: String(destinationCode) } });
  if (!destination) return { price: null, zoneName: null, destination: null, source: null, zonePrice: null };

  const zones = await prisma.priceZone.findMany();
  const zone = matchZone(pickupAddress, zones);
  // Le filtre sur le rôle évite de lire par erreur la fiche d'un chauffeur portant le même
  // identifiant qu'un client.
  const clientPrices = clientId
    ? await prisma.user.findFirst({ where: { id: String(clientId), role: "CLIENT" }, select: { priceYUL: true, priceYHU: true, priceREM: true } })
    : null;

  return {
    price: priceFor(destination, zone, clientPrices),
    zoneName: zone?.name || null,
    destination,
    source: priceSource(destination, zone, clientPrices),
    zonePrice: priceFor(destination, zone),
  };
}

/**
 * Grille tarifaire rangée par ordre alphabétique des municipalités, accents et majuscules
 * ignorés (« Éloi » entre « D » et « F », « Saint-Jean » avant « Sainte-Julie »). Demande du
 * propriétaire du 20 septembre 2026 : une ville ajoutée arrivait en bas de la page Tarifs.
 */
export function trierZonesParNom(zones) {
  return [...(zones || [])].sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), "fr", { sensitivity: "base", numeric: true })
  );
}
