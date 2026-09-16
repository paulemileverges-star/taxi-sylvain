import { prisma } from "./prisma.js";

// Reconnaît la municipalité de prise en charge dans une adresse (saisie libre ou suggestion
// OpenStreetMap « 123, Rue X, Chambly, Montérégie, Québec, J3L 1A1, Canada ») et renvoie le tarif
// du catalogue vers la destination demandée.
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

// Renvoie { price, zoneName, destination } — price null si aucun tarif ne s'applique.
export async function quote({ pickupAddress, destinationCode }) {
  if (!destinationCode) return { price: null, zoneName: null, destination: null };
  const destination = await prisma.destination.findUnique({ where: { code: String(destinationCode) } });
  if (!destination) return { price: null, zoneName: null, destination: null };

  if (destination.code === "YUL" || destination.code === "YHU") {
    const zones = await prisma.priceZone.findMany();
    const zone = matchZone(pickupAddress, zones);
    const price = zone ? (destination.code === "YUL" ? zone.priceYUL : zone.priceYHU) : null;
    return { price: price ?? null, zoneName: zone?.name || null, destination };
  }
  return { price: destination.price ?? null, zoneName: null, destination };
}
