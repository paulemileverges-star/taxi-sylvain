// Vérification du contenu réel d'une photo envoyée (audit du 7 octobre 2026, SEC-13).
//
// multer accepte un fichier sur le type que le téléphone ANNONCE (image/jpeg...). Un fichier
// quelconque renommé passait donc, et était servi publiquement. On lit ici sa signature binaire et
// ses dimensions : seules les vraies images JPEG, PNG et WebP, du format annoncé, de taille
// raisonnable, sont gardées. Pas de dépendance native (sharp) : l'analyse des en-têtes suffit.
import fs from "node:fs";

export const DIMENSION_MAX = 10000; // pixels, largeur ou hauteur
export const DIMENSION_MIN = 16;

const REFUS = "Le fichier envoyé n'est pas une photo JPEG, PNG ou WebP valide.";

function dimensionsJpeg(b) {
  // Parcours des segments jusqu'à l'en-tête de trame (SOF), qui porte hauteur et largeur.
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marqueur = b[i + 1];
    if (marqueur === 0xd8 || (marqueur >= 0xd0 && marqueur <= 0xd7) || marqueur === 0x01) { i += 2; continue; }
    const longueur = b.readUInt16BE(i + 2);
    const estSof = marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur);
    if (estSof) return { hauteur: b.readUInt16BE(i + 5), largeur: b.readUInt16BE(i + 7) };
    if (longueur < 2) return null;
    i += 2 + longueur;
  }
  return null;
}

function dimensionsWebp(b) {
  const bloc = b.toString("ascii", 12, 16);
  if (bloc === "VP8 " && b.length >= 30) return { largeur: b.readUInt16LE(26) & 0x3fff, hauteur: b.readUInt16LE(28) & 0x3fff };
  if (bloc === "VP8L" && b.length >= 25 && b[20] === 0x2f) {
    const bits = b.readUInt32LE(21);
    return { largeur: (bits & 0x3fff) + 1, hauteur: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (bloc === "VP8X" && b.length >= 30) return { largeur: b.readUIntLE(24, 3) + 1, hauteur: b.readUIntLE(27, 3) + 1 };
  return null;
}

/** Format et dimensions d'après le contenu, ou null si ce n'est pas une image reconnue. */
export function analyserImage(b) {
  if (!Buffer.isBuffer(b) || b.length < 16) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const d = dimensionsJpeg(b);
    return d && { type: "image/jpeg", ...d };
  }
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && b.toString("ascii", 12, 16) === "IHDR" && b.length >= 24) {
    return { type: "image/png", largeur: b.readUInt32BE(16), hauteur: b.readUInt32BE(20) };
  }
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const d = dimensionsWebp(b);
    return d && { type: "image/webp", ...d };
  }
  return null;
}

/** Verdict sur un contenu : { ok: true, ...image } ou { ok: false, raison }. */
export function verdictImage(contenu, typeAnnonce) {
  const image = analyserImage(contenu);
  if (!image || image.type !== typeAnnonce) return { ok: false, raison: REFUS };
  const { largeur, hauteur } = image;
  if (!(largeur >= DIMENSION_MIN && hauteur >= DIMENSION_MIN)) return { ok: false, raison: REFUS };
  if (largeur > DIMENSION_MAX || hauteur > DIMENSION_MAX) {
    return { ok: false, raison: `Photo trop grande (${largeur} × ${hauteur} pixels) : ${DIMENSION_MAX} pixels au plus de côté.` };
  }
  return { ok: true, ...image };
}

/** Même verdict, sur un fichier déjà écrit par multer. */
export async function formatImageReel(chemin, typeAnnonce) {
  try {
    return verdictImage(await fs.promises.readFile(chemin), typeAnnonce);
  } catch {
    return { ok: false, raison: REFUS };
  }
}
