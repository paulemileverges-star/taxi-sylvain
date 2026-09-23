// Liens de téléchargement Android définitifs : /telecharger/chauffeur.apk et /telecharger/client.apk
// renvoient toujours vers le fichier le plus récent déposé dans uploads/apk/, quelle que soit sa version.
// Les fichiers sont nommés « Taxi-Sylvain-Chauffeur-1.4.0.apk » ou « Taxi-Sylvain-Client-1.4.0.apk ».
const PREFIXES = { chauffeur: "Taxi-Sylvain-Chauffeur-", client: "Taxi-Sylvain-Client-" };

export const APPLICATIONS = Object.keys(PREFIXES);

function versionDe(nom, prefixe) {
  const m = nom.startsWith(prefixe) && nom.endsWith(".apk") ? nom.slice(prefixe.length, -4).match(/^(\d+)\.(\d+)\.(\d+)$/) : null;
  return m ? m.slice(1).map(Number) : null;
}

function plusRecent(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

/** Nom du fichier .apk le plus récent pour une application (« chauffeur » ou « client »), ou null. */
export function dernierApk(fichiers, application) {
  const prefixe = PREFIXES[application];
  if (!prefixe) return null;
  let meilleur = null;
  for (const nom of fichiers) {
    const v = versionDe(nom, prefixe);
    if (v && (!meilleur || plusRecent(v, meilleur.version) > 0)) meilleur = { nom, version: v };
  }
  return meilleur ? meilleur.nom : null;
}
