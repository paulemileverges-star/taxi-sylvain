import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { cleanAddressText } from "../lib/addressFormat.js";
import { realEmailOrNull } from "../lib/placeholderEmail.js";
import { aPermission, estEquipe } from "../lib/equipe.js";

// Saisie intuitive côté Dispatch : propose, au fur et à mesure de la frappe, ce que la base
// contient déjà (clients, chauffeurs, adresses déjà utilisées, numéros de vol) pour éviter de
// ressaisir — et de créer des doublons.
const router = Router();
router.use(requireAuth);

const LIMIT = 8;

// Chaque type de suggestion exige l'une des permissions des pages qui s'en servent (audit du
// 7 octobre 2026, SEC-02) : avant, tout compte ADMIN, même sans aucun droit, lisait ainsi les
// téléphones et adresses des clients que la page Clients lui refusait.
export const PERMISSIONS_SUGGESTION = {
  client: ["clients", "courses"],
  driver: ["drivers", "courses", "schedule"],
  address: ["courses", "schedule", "clients"],
  flight: ["courses", "schedule"],
  zone: ["courses"],
};

router.get("/", async (req, res) => {
  if (!estEquipe(req.user)) return res.status(403).json({ error: "Accès refusé." });
  const q = String(req.query.q || "").trim().slice(0, 100);
  const field = String(req.query.field || "");
  const requises = PERMISSIONS_SUGGESTION[field];
  if (!requises) return res.json([]);
  if (!aPermission(req.user, ...requises)) return res.status(403).json({ error: "Accès refusé : cette fonctionnalité n'est pas autorisée pour votre compte." });
  if (q.length < 2) return res.json([]);
  const like = { contains: q, mode: "insensitive" };

  if (field === "client") {
    const clients = await prisma.user.findMany({
      where: { role: "CLIENT", OR: [{ name: like }, { phone: like }, { email: like }, { address: like }] },
      select: { id: true, name: true, phone: true, email: true, address: true },
      take: LIMIT,
      orderBy: { name: "asc" },
    });
    return res.json(clients.map((c) => ({
      value: c.name,
      label: c.name,
      detail: [c.phone, c.address].filter(Boolean).join(" · "),
      data: { ...c, email: realEmailOrNull(c.email) },
    })));
  }

  if (field === "driver") {
    const drivers = await prisma.user.findMany({
      where: { role: "DRIVER", OR: [{ name: like }, { phone: like }, { email: like }, { plate: like }, { carModel: like }] },
      select: { id: true, name: true, phone: true, email: true, carModel: true, plate: true },
      take: LIMIT,
      orderBy: { name: "asc" },
    });
    return res.json(drivers.map((d) => ({
      value: d.name,
      label: d.name,
      detail: [d.carModel, d.plate, d.phone].filter(Boolean).join(" · "),
      data: d,
    })));
  }

  if (field === "address") {
    // Adresses déjà connues : domiciles des clients + départs/destinations des courses passées.
    const [clients, pickups, dests] = await Promise.all([
      prisma.user.findMany({ where: { address: like }, select: { address: true }, take: LIMIT }),
      prisma.ride.findMany({ where: { pickupAddress: like }, select: { pickupAddress: true, pickupLat: true, pickupLng: true }, take: LIMIT, orderBy: { createdAt: "desc" } }),
      prisma.ride.findMany({ where: { destAddress: like }, select: { destAddress: true, destLat: true, destLng: true }, take: LIMIT, orderBy: { createdAt: "desc" } }),
    ]);
    const seen = new Map();
    const add = (brut, lat, lng) => {
      // Les adresses déjà en base peuvent dater d'avant la forme unique : on les propose nettoyées,
      // sinon une ancienne forme se recycle indéfiniment d'une course à l'autre.
      const address = cleanAddressText(brut);
      const key = String(address || "").trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.set(key, { value: address, label: address, detail: "déjà utilisée", data: { lat: lat ?? null, lng: lng ?? null } });
    };
    for (const c of clients) add(c.address, null, null);
    for (const r of pickups) add(r.pickupAddress, r.pickupLat, r.pickupLng);
    for (const r of dests) add(r.destAddress, r.destLat, r.destLng);
    return res.json([...seen.values()].slice(0, LIMIT));
  }

  if (field === "flight") {
    const rides = await prisma.ride.findMany({
      where: { flightNumber: like },
      select: { flightNumber: true },
      distinct: ["flightNumber"],
      take: LIMIT,
      orderBy: { createdAt: "desc" },
    });
    return res.json(rides.filter((r) => r.flightNumber).map((r) => ({ value: r.flightNumber, label: r.flightNumber, detail: "déjà utilisé" })));
  }

  if (field === "zone") {
    const zones = await prisma.priceZone.findMany({ where: { name: like }, select: { name: true }, take: LIMIT, orderBy: { name: "asc" } });
    return res.json(zones.map((z) => ({ value: z.name, label: z.name })));
  }

  res.json([]);
});

export default router;
