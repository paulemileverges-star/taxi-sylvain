import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { formatFromNominatim, buildGeocodeParams, confidenceFromOsm, expandAbbreviations } from "../lib/addressFormat.js";
import { googleActif, suggestions as suggestionsGoogle, detailsLieu } from "../lib/googleMaps.js";
import { rechercheAeroportYul, CODES_YUL } from "../lib/aeroportYul.js";

const router = Router();
router.use(requireAuth);

// Aéroport Montréal-Trudeau : seules deux adresses sont proposées (demande du propriétaire du
// 6 octobre 2026), les Arrivées et le stationnement P4 (débarcadère Express), tenues dans le
// catalogue (page Tarifs). Règle de reconnaissance dans lib/aeroportYul.js.
async function adressesYul() {
  const destinations = await prisma.destination.findMany({ where: { code: { in: CODES_YUL } }, orderBy: { sortOrder: "asc" } });
  return destinations.map((d) => ({
    label: d.address,
    nomLieu: d.label,
    lat: d.lat,
    lng: d.lng,
    confidence: d.pointVerified ? "verifie" : null,
    placeId: null,
    catalogue: d.code,
  }));
}

// Autocomplétion d'adresses (Dispatch et Client) : Google Maps quand la clé est posée, sinon
// Nominatim (OpenStreetMap, gratuit, sans clé). Avec Google, une suggestion n'a pas encore de
// coordonnées : l'application demande /geocode/place/:placeId au moment du choix ; une ancienne
// version qui ne le fait pas envoie le texte, que le serveur géocode alors lui-même avec Google.
router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 3) return res.json([]);
  if (rechercheAeroportYul(q)) return res.json(await adressesYul());

  if (googleActif()) {
    try {
      const session = typeof req.query.session === "string" ? req.query.session.slice(0, 100) : undefined;
      const liste = await suggestionsGoogle(q, session);
      return res.json(liste.map((s) => ({ label: s.label, nomLieu: s.nomLieu, lat: null, lng: null, confidence: null, placeId: s.placeId, source: "google" })));
    } catch (e) {
      console.error("Suggestions Google en échec, repli sur OpenStreetMap :", e.message);
    }
  }

  const params = buildGeocodeParams({ q: expandAbbreviations(q) });
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
          return label ? { label, nomLieu, lat: parseFloat(r.lat), lng: parseFloat(r.lon), confidence: confidenceFromOsm(r), source: "openstreetmap" } : null;
        })
        .filter(Boolean)
    );
  } catch {
    res.status(502).json({ error: "Service de suggestions indisponible." });
  }
});

// Détail d'une suggestion Google choisie : adresse à la forme unique, point exact, identifiant.
router.get("/place/:placeId", async (req, res) => {
  if (!googleActif()) return res.status(404).json({ error: "Suggestions Google non activées." });
  const placeId = String(req.params.placeId || "");
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return res.status(400).json({ error: "Lieu invalide." });
  try {
    const lieu = await detailsLieu(placeId, {
      sessionToken: typeof req.query.session === "string" ? req.query.session.slice(0, 100) : undefined,
      texteTape: typeof req.query.q === "string" ? req.query.q.slice(0, 200) : "",
      nomLieu: typeof req.query.nom === "string" ? req.query.nom.slice(0, 200) : null,
    });
    if (!lieu.address || lieu.lat === null) return res.status(404).json({ error: "Adresse introuvable." });
    res.json({ label: lieu.address, lat: lieu.lat, lng: lieu.lng, confidence: lieu.confidence, placeId: lieu.placeId, source: "google" });
  } catch (e) {
    console.error("Détail Google en échec :", e.message);
    res.status(502).json({ error: "Service d'adresses indisponible. Réessayez." });
  }
});

// Fournisseur d'adresses actif, pour l'affichage de la console (« vérifiée par Google Maps »).
router.get("/fournisseur", (req, res) => res.json({ fournisseur: googleActif() ? "google" : "openstreetmap" }));

export default router;
