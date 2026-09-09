import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Autocomplétion d'adresses (besoin: suggestions en temps réel à la saisie pour le Dispatch
// et le Client) — proxy vers Nominatim (OpenStreetMap), gratuit et sans clé API, cohérent avec
// le choix déjà fait pour la carte en direct. Biaisé sur le Québec/Canada.
router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 3) return res.json([]);

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "0",
    limit: "5",
    countrycodes: "ca",
    viewbox: "-79.8,45.0,-56.8,62.6", // Québec, grossièrement
    bounded: "0",
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "TaxiSylvain/1.0 (dispatch@taxi-sylvain.com)" },
    });
    if (!response.ok) return res.status(502).json({ error: "Service de suggestions indisponible." });
    const results = await response.json();
    res.json(
      results.map((r) => ({
        label: r.display_name,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      }))
    );
  } catch {
    res.status(502).json({ error: "Service de suggestions indisponible." });
  }
});

export default router;
