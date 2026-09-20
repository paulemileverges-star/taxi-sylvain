import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { formatFromNominatim, buildGeocodeParams } from "../lib/addressFormat.js";

const router = Router();
router.use(requireAuth);

// Autocomplétion d'adresses (besoin: suggestions en temps réel à la saisie pour le Dispatch
// et le Client) — proxy vers Nominatim (OpenStreetMap), gratuit et sans clé API, cohérent avec
// le choix déjà fait pour la carte en direct. Biaisé sur le Québec/Canada.
router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 3) return res.json([]);

  const params = buildGeocodeParams({ q });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "TaxiSylvain/1.0 (+https://taxisylvain.ca)" },
    });
    if (!response.ok) return res.status(502).json({ error: "Service de suggestions indisponible." });
    const results = await response.json();
    res.json(
      results
        .map((r) => {
          const label = formatFromNominatim(r, q);
          // Le nom du lieu n'entre JAMAIS dans l'adresse enregistrée : mis devant une adresse
          // civique, il ferait reconnaître la mauvaise municipalité, donc facturer un autre prix.
          // Il n'est là que pour aider à choisir dans la liste.
          const nomLieu = r.name && label && !label.includes(r.name) ? r.name : null;
          return label ? { label, nomLieu, lat: parseFloat(r.lat), lng: parseFloat(r.lon) } : null;
        })
        .filter(Boolean)
    );
  } catch {
    res.status(502).json({ error: "Service de suggestions indisponible." });
  }
});

export default router;
