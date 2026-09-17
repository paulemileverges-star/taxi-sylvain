import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Dossier des photos (chauffeur / véhicule). Un seul endroit de vérité : l'écriture (multer) et la
// lecture (express.static) doivent pointer exactement au même endroit, sinon les photos sont
// enregistrées quelque part et servies ailleurs. En production, c'est le disque persistant Railway
// monté sur /app/uploads.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.join(__dirname, "..", "..", "uploads");

export function ensureUploadsDir() {
  fs.mkdirSync(uploadsDir, { recursive: true });
  let count = 0;
  try {
    count = fs.readdirSync(uploadsDir).length;
  } catch {
    count = -1;
  }
  console.log(`Photos : dossier ${uploadsDir} — ${count} fichier(s).`);
}
