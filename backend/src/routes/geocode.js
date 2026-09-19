import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Libellé court et lisible, tel qu'on écrirait l'adresse soi-même : « 12 Rue Bourgogne, Chambly,
// QC J3L 1Z6 » plutôt que la longue chaîne OpenStreetMap (quartier, MRC, région, pays). Même
// forme partout (fiche client, prise en charge, cédule) — c'est ce qui évite que deux écrans
// montrent la « même » adresse écrite différemment.
const PROVINCE_CODES = { "Québec": "QC", "Quebec": "QC", "Ontario": "ON", "New Brunswick": "NB", "Nouveau-Brunswick": "NB" };
function shortLabel(r, typedNumber) {
  const a = r.address || {};
  const road = a.road || a.pedestrian || a.footway;
  // OpenStreetMap ne connaît pas toujours le numéro civique : on garde alors celui que la personne
  // a tapé plutôt que de le perdre (le chauffeur en a besoin).
  const number = a.house_number || (road && typedNumber ? typedNumber : null);
  const street = [number, road].filter(Boolean).join(" ");
  const place = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || a.county;
  const name = !street && r.name && r.name !== place ? r.name : null; // lieu nommé (aéroport, station...)
  const province = PROVINCE_CODES[a.state] || a.state;
  const tail = [province, a.postcode].filter(Boolean).join(" ");
  const parts = [name, street, place, tail].filter(Boolean);
  return parts.length >= 2 ? parts.join(", ") : r.display_name;
}

// Autocomplétion d'adresses (besoin: suggestions en temps réel à la saisie pour le Dispatch
// et le Client) — proxy vers Nominatim (OpenStreetMap), gratuit et sans clé API, cohérent avec
// le choix déjà fait pour la carte en direct. Biaisé sur le Québec/Canada.
router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 3) return res.json([]);

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: "5",
    countrycodes: "ca",
    viewbox: "-79.8,45.0,-56.8,62.6", // Québec, grossièrement
    bounded: "0",
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "TaxiSylvain/1.0 (+https://taxisylvain.ca)" },
    });
    if (!response.ok) return res.status(502).json({ error: "Service de suggestions indisponible." });
    const results = await response.json();
    const typedNumber = (q.match(/^(\d+[a-zA-Z]?)\b/) || [])[1] || null;
    res.json(
      results.map((r) => ({
        label: shortLabel(r, typedNumber),
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      }))
    );
  } catch {
    res.status(502).json({ error: "Service de suggestions indisponible." });
  }
});

export default router;
