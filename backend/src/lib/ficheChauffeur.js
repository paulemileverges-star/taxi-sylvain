// Fiche d'un chauffeur modifiée par le Dispatch (demande du propriétaire du 6 octobre 2026 :
// « s'ils changent de voiture, la couleur, le nom, etc. »). Fichier pur, testé sans base.
//
// Règles : seuls les champs présents changent ; le nom, le courriel et le téléphone ne peuvent pas
// être vidés (connexion, appel masqué, courriels) ; véhicule, couleur et plaque peuvent l'être.

const COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function texte(v, max) {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Rend { data } prêt pour Prisma, ou { erreur } en français. */
export function donneesFicheChauffeur(body = {}) {
  const data = {};
  if (body.name !== undefined) {
    const nom = texte(body.name, 120);
    if (!nom) return { erreur: "Le nom ne peut pas être vide." };
    data.name = nom;
  }
  if (body.email !== undefined) {
    const courriel = texte(body.email, 200).toLowerCase();
    if (!COURRIEL.test(courriel)) return { erreur: "Courriel invalide." };
    data.email = courriel;
  }
  if (body.phone !== undefined) {
    const tel = texte(body.phone, 40);
    if ((tel.match(/\d/g) || []).length < 10) return { erreur: "Téléphone invalide : 10 chiffres au moins (ex. 514-555-1234)." };
    data.phone = tel;
  }
  for (const [champ, max] of [["carModel", 120], ["carColor", 60], ["plate", 20]]) {
    if (body[champ] === undefined) continue;
    const v = texte(body[champ], max);
    data[champ] = v ? (champ === "plate" ? v.toUpperCase() : v) : null;
  }
  return { data };
}
