import appJson from "../../app.json";

// Version affichée en bas de l'accueil : celle de l'application installée et, pour la version web,
// le commit inscrit à la construction par scripts/publier-web.mjs. La surveillance vérifie que le
// site en ligne porte le dernier commit de l'application (audit du 7 octobre 2026, OPS-04).
export const VERSION_APP = appJson.expo?.version || "";
export const VERSION_WEB = process.env.EXPO_PUBLIC_VERSION_WEB || null;

export function versionAffichee() {
  return VERSION_WEB ? `${VERSION_APP} · web ${VERSION_WEB}` : VERSION_APP;
}
