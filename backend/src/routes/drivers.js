import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { deleteUserCascade } from "../lib/deleteUser.js";
import { getOnlineDriverIds } from "../lib/onlineDrivers.js";
import { streamListPdf, streamListXlsx } from "../lib/exportReport.js";
import { generateTempPassword } from "../lib/placeholderEmail.js";
import { parseImportFile, pick } from "../lib/bulkImport.js";
import { getAllDriverLocations } from "../lib/driverLocations.js";

const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Crée un compte chauffeur — réutilisé par la route de création directe ci-dessous et par la
// création "à la volée" d'un nouveau chauffeur pendant la création d'une course (rides.js).
// Le mot de passe est optionnel : s'il n'est pas fourni, un mot de passe temporaire est généré
// et renvoyé en clair (une seule fois) pour que le Dispatch puisse le transmettre au chauffeur.
export async function createDriverAccount({ name, email, phone, password, carModel, plate }) {
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
    data: { role: "DRIVER", name, email, phone, passwordHash, carModel: carModel || null, plate: plate || null },
    select: { id: true, name: true, email: true, phone: true, carModel: true, plate: true, ratingAvg: true, photoUrl: true, carPhotoUrl: true },
  });
  return { driver, tempPassword };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "..", "..", "uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    cb(null, `${req.params.id}-${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const router = Router();
router.use(requireAuth);

router.get("/", requirePermission("drivers"), async (req, res) => {
  const drivers = await prisma.user.findMany({
    where: { role: "DRIVER" },
    select: { id: true, name: true, carModel: true, plate: true, ratingAvg: true, photoUrl: true, carPhotoUrl: true },
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

router.delete("/:id", requirePermission("drivers"), async (req, res) => {
  try {
    await deleteUserCascade(req.params.id);
    res.status(204).end();
  } catch (e) {
    res.status(404).json({ error: "Chauffeur introuvable." });
  }
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
      const { driver } = await createDriverAccount({
        name, email, phone,
        carModel: pick(row, "vehicule", "véhicule", "carmodel") || undefined,
        plate: pick(row, "plaque", "plate") || undefined,
      });
      created.push(driver.name);
    } catch (e) {
      skipped.push({ row, reason: e.message });
    }
  }
  res.json({ createdCount: created.length, skippedCount: skipped.length, skipped });
});

// Dernières positions connues des chauffeurs en course — carte en direct du Dispatch.
router.get("/locations", (req, res) => {
  if (req.user.role !== "DISPATCH" && req.user.role !== "ADMIN") return res.status(403).json({ error: "Accès refusé." });
  res.json(getAllDriverLocations());
});

// Recherche dans les bases clients / chauffeurs / courses (besoin #14)
router.get("/search", requirePermission("drivers"), async (req, res) => {
  const q = String(req.query.q || "");
  const [users, rides] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
      select: { id: true, name: true, role: true, email: true },
    }),
    prisma.ride.findMany({
      where: { OR: [{ pickupAddress: { contains: q, mode: "insensitive" } }, { destAddress: { contains: q, mode: "insensitive" } }] },
      take: 20,
    }),
  ]);
  res.json({ users, rides });
});

// Export de la base de chauffeurs (PDF ou Excel).
router.get("/export", requirePermission("drivers"), async (req, res) => {
  const format = req.query.format === "xlsx" ? "xlsx" : "pdf";
  const drivers = await prisma.user.findMany({
    where: { role: "DRIVER" },
    select: { name: true, email: true, phone: true, carModel: true, plate: true, ratingAvg: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  const rows = drivers.map((d) => ({
    name: d.name,
    email: d.email,
    phone: d.phone,
    carModel: d.carModel || "",
    plate: d.plate || "",
    ratingAvg: d.ratingAvg?.toFixed(1) ?? "5.0",
    createdAt: new Date(d.createdAt).toLocaleDateString("fr-CA"),
  }));
  const columns = [
    { key: "name", label: "Nom", width: 140 },
    { key: "email", label: "Courriel", width: 200 },
    { key: "phone", label: "Téléphone", width: 110 },
    { key: "carModel", label: "Véhicule", width: 150 },
    { key: "plate", label: "Plaque", width: 90 },
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
  upload.fields([{ name: "photo", maxCount: 1 }, { name: "carPhoto", maxCount: 1 }]),
  async (req, res) => {
    const { id } = req.params;
    const isAdminWithAccess = req.user.role === "ADMIN" && req.user.permissions?.includes("drivers");
    if (req.user.role !== "DISPATCH" && !isAdminWithAccess && req.user.id !== id) {
      return res.status(403).json({ error: "Accès refusé." });
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
    res.json(driver);
  }
);

export default router;
