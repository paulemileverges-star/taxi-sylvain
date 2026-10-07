// Échappement HTML commun à tous les courriels (audit du 7 octobre 2026, SEC-10) : tout texte venu
// d'une personne (nom, adresse, message) est inséré comme TEXTE, jamais comme balise.
export function echapperHtml(valeur) {
  return String(valeur ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
