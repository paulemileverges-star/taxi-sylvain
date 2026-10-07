// Version de la console affichée en bas du menu : le commit inscrit à la construction par
// scripts/publier-web.mjs (« locale » hors publication). La surveillance vérifie que le site en
// ligne porte le dernier commit de la console (audit du 7 octobre 2026, OPS-04).
export const VERSION_WEB = import.meta.env.VITE_VERSION_WEB || "locale";
