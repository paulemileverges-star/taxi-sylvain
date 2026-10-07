import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma.js";
import { uploadsDir } from "../lib/uploads.js";
import { requireAuth, requirePermission, requireAnyPermission } from "../middleware/auth.js";
import { deleteUserCascade, announceDeletion } from "../lib/deleteUser.js";
import { getOnlineDriverIds } from "../lib/onlineDrivers.js";
import { streamListPdf, streamListXlsx } from "../lib/exportReport.js";
import { generateTempPassword, realEmailOrNull } from "../lib/placeholderEmail.js";
import { parseImportFile, pick } from "../lib/bulkImport.js";
import { getAllDriverLocations } from "../lib/driverLocations.js";
import { donneesFicheChauffeur } from "../lib/ficheChauffeur.js";
import { AUDIENCES, aPermission, emettreEquipe } from "../lib/equipe.js";
import { formatImageReel } from "../lib/images.js";
import { reinitialiserMotDePasse } from "../lib/motsDePasse.js";

const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Crée un compte chauffeur — réutilisé par la route de création directe ci-dessous et par la
// création "à la volée" d'un nouveau chauffeur pendant la création d'une course (rides.js).
// Le mot de passe est optionnel : s'il n'est pas fourni, un mot de passe temporaire est généré
// et renvoyé en clair (une seule fois) pour que le Dispatch puisse le transmettre au chauffeur.
export async function createDriverAccount({ name, email, phone, password, carModel, carColor, plate }) {
  if (!name || !email || !phone) {
    const err = new Error("Nom, courriel et téléphone sont requis.");
    err.status = 400;
    throw err;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error("Ce courriel est déjà utilisé.");
    err.status = 409;
    throw err;
  }
  const tempPassword = password || generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const driver = await prisma.user.create({
    data: {
      role: "DRIVER", name, email, phone, passwordHash, carModel: carModel || null, carColor: carColor || null, plate: plate || null,
      // Le chauffeur confirme son courriel par code à sa première connexion (lib/verification.js).
      emailVerifiedAt: realEmailOrNull(email) ? null : new Date(),
    },
    select: { id: true, name: true, email: true, phone: true, carModel: true, carColor: true, plate: true, ratingAvg: true, photoUrl: true, carPhotoUrl: true },
  });
  return { driver, tempPassword };
}

// Envoi des photos, verrouillé après la relecture du 19 septembre 2026. Avant : l'extension venait
// du nom du fichier envoyé (un « .html » passait), l'identifiant de l'adresse entrait tel quel dans
// le nom du fichier (« ..%2F » permettait d'écrire hors du dossier), et le fichier était écrit
// AVANT la vérification des droits. Désormais : identifiant vérifié, droits vérifiés avant toute
// écriture, nom de fichier fabriqué par le serveur avec une extension d'image choisie par lui.
const PHOTO_TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const PHOTO_FIELDS = ["photo", "carPhoto"];

// Identifiant de compte (cuid) : lettres et chiffres seulement.
export function isSafeId(id) {
  return typeof id === "string" && /^[a-z0-9]{8,40}$/i.test(id);
}

// Nom du fichier enregistré, ou null si l'envoi doit être refusé.
export function photoFileName(id, field, mimetype, now = Date.now()) {
  const ext = PHOTO_TYPES[mimetype];
  if (!ext || !isSafeId(id) || !PHOTO_FIELDS.includes(field)) return null;
  return `${id}-${field}-${now}${ext}`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const name = photoFileName(req.params.id, file.fieldname, file.mimetype);
    if (!name) return cb(new Error("Fichier refusé."));
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Boolean(PHOTO_TYPES[file.mimetype]) && PHOTO_FIELDS.includes(file.fieldname)),
});

// Vérifié AVANT que multer n'écrive quoi que ce soit sur le disque.
async function canEditPhotos(req, res, next) {
  const { id } = req.params;
  if (!isSafeId(id)) return res.status(404).json({ error: "Chauffeur introuvable." });
  if (!aPermission(req.user, "drivers") && req.user.id !== id) {
    return res.status(403).json({ error: "Accès refusé." });
  }
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, photoUrl: true, carPhotoUrl: true } });
  if (!target || target.role !== "DRIVER") return res.status(404).json({ error: "Chauffeur introuvable." });
  req.previousPhotos = target;
  next();
}

// Efface une ancienne photo remplacée (fichier servi publiquement). Jamais bloquant.
async function removeReplacedPhoto(url) {
  const name = typeof url === "string" ? path.basename(url) : "";
  if (!name) return;
  try {
    await fs.promises.unlink(path.join(uploadsDir, name));
  } catch (e) {
    if (e.code !== "ENOENT") console.error(`Ancienne photo non effacée (${name}) :`, e.message);
  }
}

const router = Router();
router.use(requireAuth);

router.get("/", requirePermission("drivers"), async (req, res) => {
  const drivers = await prisma.user.findMany({
    where: { role: "DRIVER" },
    // emailVerifiedAt : la console montre qui n’a pas encore confirmé son courriel (et peut le faire à sa place).
    // Courriel et téléphone : pré-remplissent la fenêtre « Modifier » (route réservée à la permission chauffeurs).
    select: { id: true, name: true, email: true, phone: true, carModel: true, carColor: true, plate: true, ratingAvg: true, photoUrl: true, carPhotoUrl: true, emailVerifiedAt: true },
    orderBy: { name: "asc" },
  });
  const onlineIds = getOnlineDriverIds();
  res.json(drivers.map((d) => ({ ...d, online: onlineIds.has(d.id) })));
});

// Liste minimale des chauffeurs pour les sélecteurs des pages Courses, Cédule et Messagerie
// (audit du 7 octobre 2026, F04) : un collaborateur autorisé aux courses doit pouvoir choisir un
// chauffeur sans recevoir les courriels et téléphones réservés à la permission Chauffeurs.
router.get("/choix", requireAnyPermission("drivers", "courses", "schedule", "groups"), async (req, res) => {
  const drivers = await prisma.user.findMany({
    where: { role: "DRIVER" },
    select: { id: true, name: true, carModel: true, carColor: true, plate: true, ratingAvg: true, photoUrl: true, carPhotoUrl: true },
    orderBy: { name: "asc" },
  });
  const onlineIds = getOnlineDriverIds();
  res.json(drivers.map((d) => ({ ...d, online: onlineIds.has(d.id) })));
});

// Créer un compte chauffeur depuis la console Dispatch
router.post("/", requirePermission("drivers"), async (req, res) => {
  try {
    const { driver, tempPassword } = await createDriverAccount(req.body);
    res.status(201).json({ ...driver, tempPassword });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Modifier la fiche d'un chauffeur depuis la console (demande du propriétaire du 6 octobre 2026) :
// nom, courriel, téléphone, véhicule, couleur, plaque. Seuls les champs envoyés changent ; les règles
// sont dans lib/ficheChauffeur.js. Le chauffeur et le Dispatch voient la fiche à jour sans recharger.
router.patch("/:id", requirePermission("drivers"), async (req, res) => {
  const id = String(req.params.id);
  if (!isSafeId(id)) return res.status(404).json({ error: "Chauffeur introuvable." });
  const actuel = await prisma.user.findUnique({ where: { id }, select: { role: true, email: true } });
  if (!actuel || actuel.role !== "DRIVER") return res.status(404).json({ error: "Chauffeur introuvable." });

  const { data, erreur } = donneesFicheChauffeur(req.body);
  if (erreur) return res.status(400).json({ error: erreur });
  if (Object.keys(data).length === 0) return res.status(400).json({ error: "Aucune modification reçue." });
  if (data.email && data.email !== actuel.email) {
    const pris = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (pris && pris.id !== id) return res.status(409).json({ error: "Ce courriel est déjà utilisé par un autre compte." });
    // Le Dispatch connaît son chauffeur : le nouveau courriel vaut confirmé, sans code à saisir.
    data.emailVerifiedAt = new Date();
  }

  const chauffeur = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, phone: true, carModel: true, carColor: true, plate: true, ratingAvg: true, photoUrl: true, carPhotoUrl: true, emailVerifiedAt: true },
  });
  const io = req.app.get("io");
  if (io) {
    emettreEquipe(io, AUDIENCES.chauffeurs, "driver:updated", chauffeur);
    // Courses et Cédule n'ont besoin que du nom et du véhicule, sans courriel ni téléphone.
    // eslint-disable-next-line no-unused-vars
    const { email, phone, emailVerifiedAt, ...reduite } = chauffeur;
    emettreEquipe(io, ["courses", "schedule"], "driver:updated", reduite, { sauf: AUDIENCES.chauffeurs });
    io.to(`driver:${id}`).emit("driver:updated", chauffeur);
  }
  res.json(chauffeur);
});

// Nouveau mot de passe temporaire pour un chauffeur qui a perdu le sien, ou créé par import
// (audit du 7 octobre 2026, B05) : il est montré une seule fois au Dispatch, et toutes les sessions
// ouvertes du chauffeur sont fermées.
router.post("/:id/reset-password", requirePermission("drivers"), async (req, res) => {
  const resultat = await reinitialiserMotDePasse(String(req.params.id), "DRIVER", req.app.get("io"));
  if (!resultat) return res.status(404).json({ error: "Chauffeur introuvable." });
  res.json(resultat);
});

// Suppression d'un chauffeur depuis la console. Seul un compte CHAUFFEUR peut être visé ici :
// cette route ne doit jamais pouvoir effacer le compte Dispatch ou un administrateur.
router.delete("/:id", requirePermission("drivers"), async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) }, select: { role: true, name: true } });
  if (!target || target.role !== "DRIVER") return res.status(404).json({ error: "Chauffeur introuvable." });
  const result = await deleteUserCascade(req.params.id);
  announceDeletion(req.app.get("io"), result, target.name);
  res.status(204).end();
});

// Import en masse depuis un fichier .xlsx ou .csv (besoin #2) — colonnes reconnues : Nom,
// Courriel, Téléphone, Véhicule, Plaque (accents et casse ignorés).
router.post("/import", requirePermission("drivers"), importUpload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });

  let rows;
  try {
    rows = await parseImportFile(req.file);
  } catch (e) {
    return res.status(400).json({ error: "Fichier illisible. Utilisez un export .xlsx ou .csv avec une ligne d'en-têtes." });
  }

  const created = [];
  const skipped = [];
  for (const row of rows) {
    const name = pick(row, "nom", "name");
    const email = pick(row, "courriel", "email");
    const phone = pick(row, "telephone", "téléphone", "phone");
    if (!name || !email || !phone) { skipped.push({ row, reason: "Nom, courriel ou téléphone manquant." }); continue; }
    try {
      const { driver, tempPassword } = await createDriverAccount({
        name, email, phone,
        carModel: pick(row, "vehicule", "véhicule", "carmodel") || undefined,
        carColor: pick(row, "couleur", "color") || undefined,
        plate: pick(row, "plaque", "plate") || undefined,
      });
      created.push({ id: driver.id, name: driver.name, email: driver.email, tempPassword });
    } catch (e) {
      skipped.push({ row, reason: e.message });
    }
  }
  // Les mots de passe temporaires ne sont montrés qu'ici, une seule fois : sans eux, les comptes
  // importés restaient inaccessibles (audit du 7 octobre 2026, B05).
  res.json({ createdCount: created.length, skippedCount: skipped.length, skipped, created });
});

// Dernières positions connues des chauffeurs en course — carte en direct du Dispatch.
router.get("/locations", requireAnyPermission(...AUDIENCES.positions), (req, res) => {
  res.json(getAllDriverLocations());
});

// Recherche dans les bases clients / chauffeurs / courses (besoin #14)
// Chaque famille de résultats suit sa permission (audit du 7 octobre 2026, F04 et SEC-02) :
// chauffeurs avec « Chauffeurs », clients avec « Clients », courses avec « Courses » ou « Cédule ».
// Les comptes de l'équipe n'apparaissent qu'au Dispatch.
router.get("/search", requireAnyPermission("drivers", "clients", "courses", "schedule"), async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  if (q.length < 2) return res.json({ users: [], rides: [] });
  const roles = [
    aPermission(req.user, "drivers") && "DRIVER",
    aPermission(req.user, "clients") && "CLIENT",
    req.user.role === "DISPATCH" && "ADMIN",
    req.user.role === "DISPATCH" && "DISPATCH",
  ].filter(Boolean);
  const voitCourses = aPermission(req.user, ...AUDIENCES.courses);
  const [users, rides] = await Promise.all([
    roles.length
      ? prisma.user.findMany({
        where: { role: { in: roles }, OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
        select: { id: true, name: true, role: true, email: true },
        take: 50,
      })
      : [],
    voitCourses
      ? prisma.ride.findMany({
        where: { OR: [{ pickupAddress: { contains: q, mode: "insensitive" } }, { destAddress: { contains: q, mode: "insensitive" } }] },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
      : [],
  ]);
  res.json({ users: users.map((u) => ({ ...u, email: realEmailOrNull(u.email) })), rides });
});

// Export de la base de chauffeurs (PDF ou Excel).
router.get("/export", requirePermission("drivers"), async (req, res) => {
  const format = req.query.format === "xlsx" ? "xlsx" : "pdf";
  const drivers = await prisma.user.findMany({
    where: { role: "DRIVER" },
    select: { name: true, email: true, phone: true, carModel: true, carColor: true, plate: true, ratingAvg: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  const rows = drivers.map((d) => ({
    name: d.name,
    email: d.email,
    phone: d.phone,
    carModel: d.carModel || "",
    carColor: d.carColor || "",
    plate: d.plate || "",
    ratingAvg: d.ratingAvg != null ? d.ratingAvg.toFixed(1) : "Aucune note",
    createdAt: new Date(d.createdAt).toLocaleDateString("fr-CA"),
  }));
  const columns = [
    { key: "name", label: "Nom", width: 140 },
    { key: "email", label: "Courriel", width: 200 },
    { key: "phone", label: "Téléphone", width: 110 },
    { key: "carModel", label: "Véhicule", width: 130 },
    { key: "carColor", label: "Couleur", width: 70 },
    { key: "plate", label: "Plaque", width: 80 },
    { key: "ratingAvg", label: "Note", width: 60 },
    { key: "createdAt", label: "Chauffeur depuis", width: 110 },
  ];

  if (format === "xlsx") {
    await streamListXlsx(res, { title: "Chauffeurs Taxi Sylvain", filename: "chauffeurs-taxi-sylvain", columns, rows });
  } else {
    streamListPdf(res, { title: "Taxi Sylvain — Liste des chauffeurs", filename: "chauffeurs-taxi-sylvain", columns, rows });
  }
});

// Photo du chauffeur et/ou de son véhicule (besoin #13) — le chauffeur peut mettre à jour
// les siennes, le dispatch peut mettre à jour celles de n'importe quel chauffeur.
router.post(
  "/:id/photos",
  canEditPhotos,
  upload.fields([{ name: "photo", maxCount: 1 }, { name: "carPhoto", maxCount: 1 }]),
  async (req, res) => {
    const { id } = req.params;
    // Le type annoncé par le téléphone ne suffit pas : le fichier doit être une vraie image JPEG,
    // PNG ou WebP de taille raisonnable, sinon il est effacé (audit du 7 octobre 2026, SEC-13).
    const recus = [req.files?.photo?.[0], req.files?.carPhoto?.[0]].filter(Boolean);
    for (const fichier of recus) {
      const verdict = await formatImageReel(fichier.path, fichier.mimetype);
      if (!verdict.ok) {
        await Promise.all(recus.map((f) => fs.promises.unlink(f.path).catch(() => null)));
        return res.status(400).json({ error: verdict.raison });
      }
    }
    const data = {};
    if (req.files?.photo?.[0]) data.photoUrl = `/uploads/${req.files.photo[0].filename}`;
    if (req.files?.carPhoto?.[0]) data.carPhotoUrl = `/uploads/${req.files.carPhoto[0].filename}`;
    if (Object.keys(data).length === 0) return res.status(400).json({ error: "Aucune image reçue." });

    const driver = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, photoUrl: true, carPhotoUrl: true },
    });
    // Les anciennes versions ne restent pas en ligne.
    if (data.photoUrl) await removeReplacedPhoto(req.previousPhotos?.photoUrl);
    if (data.carPhotoUrl) await removeReplacedPhoto(req.previousPhotos?.carPhotoUrl);
    res.json(driver);
  }
);

export default router;
