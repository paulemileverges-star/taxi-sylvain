import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { publicKey, isWebPushConfigured, abonnementValide, enregistrerAbonnement, retirerAbonnement } from "../lib/webPush.js";

// Abonnement des navigateurs aux notifications Web Push (voir lib/webPush.js). Utilisé par les
// versions web des trois applications ; les applications installées passent par Expo Push.
const router = Router();
router.use(requireAuth);

// Clé publique VAPID : le navigateur en a besoin pour créer son abonnement.
router.get("/web/key", (req, res) => {
  res.json({ configured: isWebPushConfigured(), publicKey: publicKey() });
});

router.post("/web/subscribe", async (req, res) => {
  const sub = req.body?.subscription;
  if (!abonnementValide(sub)) return res.status(400).json({ error: "Abonnement invalide." });
  if (!isWebPushConfigured()) return res.status(503).json({ error: "Notifications web non configurées." });
  await enregistrerAbonnement(req.user.id, sub, String(req.headers["user-agent"] || "").slice(0, 200));
  res.json({ ok: true });
});

// À la déconnexion : ce navigateur ne doit plus recevoir les notifications de ce compte.
router.delete("/web/subscribe", async (req, res) => {
  await retirerAbonnement(req.body?.endpoint);
  res.json({ ok: true });
});

export default router;
