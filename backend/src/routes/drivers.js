import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

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
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const router = Router();
router.use(requireAuth);

router.get("/", requireRole("DISPATCH"), async (req, res) => {
  const drivers = await prisma.user.findMany({
    where: { role: "DRIVER" },
    select: { id: true, name: true, carModel: true, plate: true, ratingAvg: true, photoUrl: true, carPhotoUrl: true },
  });
  res.json(drivers);
});

// Recherche dans les bases clients / chauffeurs / courses (besoin #14)
router.get("/search", requireRole("DISPATCH"), async (req, res) => {
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

// Photo du chauffeur et/ou de son véhicule (besoin #13) — le chauffeur peut mettre à jour
// les siennes, le dispatch peut mettre à jour celles de n'importe quel chauffeur.
router.post(
  "/:id/photos",
  upload.fields([{ name: "photo", maxCount: 1 }, { name: "carPhoto", maxCount: 1 }]),
  async (req, res) => {
    const { id } = req.params;
    if (req.user.role !== "DISPATCH" && req.user.id !== id) {
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
