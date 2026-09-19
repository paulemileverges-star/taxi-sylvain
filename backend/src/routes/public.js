import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();

// Pages publiques (suppression de compte, confidentialité, conditions) : Google Play et l'App
// Store exigent qu'elles s'ouvrent dans un navigateur, sans compte, sans jeton et sans installer
// l'application. Les fichiers HTML vivent dans src/public/ — un seul endroit de vérité, résolu
// comme dans lib/uploads.js pour que ça marche aussi bien en local que sur Railway.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

// Cache court : les magasins et les moteurs de recherche relisent souvent ces pages, mais une
// correction de texte doit apparaître en quelques minutes, pas le lendemain.
const CACHE_CONTROL = "public, max-age=300";

// Chaque page a une adresse en français et un alias en anglais : les formulaires de Google Play
// et d'Apple demandent des URL en anglais, et les deux doivent mener exactement au même texte.
const PAGES = [
  { fichier: "suppression-compte.html", titre: "Supprimer mon compte", chemins: ["/suppression-compte", "/delete-account"] },
  { fichier: "confidentialite.html", titre: "Politique de confidentialité", chemins: ["/confidentialite", "/privacy"] },
  { fichier: "conditions.html", titre: "Conditions d'utilisation", chemins: ["/conditions", "/terms"] },
];

// Page d'erreur écrite à la main : si un fichier HTML manque (page pas encore publiée, mauvaise
// copie au déploiement), le visiteur doit lire une phrase claire et pouvoir appeler, pas voir
// une pile d'erreur technique.
function pageIntrouvable(titre) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Page indisponible — Taxi Sylvain</title>
<style>
  body { margin: 0; padding: 24px; background: #0F1B2D; color: #EDEFF3;
         font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  .carte { max-width: 560px; margin: 40px auto; background: #16233A; border: 1px solid #28395A;
           border-radius: 12px; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { color: #8B99B5; line-height: 1.6; margin: 0 0 12px; }
  a { color: #F5A623; font-weight: 600; }
</style>
</head>
<body>
  <div class="carte">
    <h1>${titre} — page indisponible</h1>
    <p>Cette page n'est pas disponible pour le moment. Ce n'est pas votre faute.</p>
    <p>Appelez Taxi Sylvain au <a href="tel:+14384991120">438-499-1120</a> et nous ferons la démarche pour vous.</p>
  </div>
</body>
</html>`;
}

function servirPage({ fichier, titre }) {
  const chemin = path.join(publicDir, fichier);
  return (req, res) => {
    if (!fs.existsSync(chemin)) return res.status(404).type("html").send(pageIntrouvable(titre));
    res.set("Cache-Control", CACHE_CONTROL);
    res.sendFile(chemin, (err) => {
      if (!err) return;
      console.error(`Page publique ${fichier} :`, err.message);
      // La réponse peut déjà être partie (fichier lu à moitié) : on n'écrit alors plus rien.
      if (!res.headersSent) res.status(404).type("html").send(pageIntrouvable(titre));
    });
  };
}

for (const page of PAGES) {
  router.get(page.chemins, servirPage(page));
}

export default router;
