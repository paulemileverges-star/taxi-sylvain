// Règles de suppression de compte. Module PUR (aucun accès à la base) : testable sans PostgreSQL,
// et écrit une seule fois pour la route de l'app, la route web et la console.
//
// Décision du propriétaire du 20 septembre 2026 (remplace celle du 19) : un client ou un chauffeur
// ne supprime plus son compte immédiatement. Il en fait la DEMANDE, depuis l'app ou la page web.
// Le Dispatch la valide (le compte est alors effacé, voir deleteUser.js) ou la refuse. En attendant,
// le compte reste utilisable et la personne peut annuler sa demande. Engagement écrit dans les pages
// légales : réponse sous DELAI_TRAITEMENT_JOURS jours.

// Une course dans ces états est commencée ou sur le point de l'être : elle ne peut pas perdre son
// client en cours de route. Tant qu'il en reste une, la validation de la suppression est refusée.
export const RIDE_STATUSES_BLOQUANTS = ["ACCEPTED", "EN_ROUTE", "STARTED"];
export const DELAI_TRAITEMENT_JOURS = 30;

const ROLES_AUTORISES = ["CLIENT", "DRIVER"];
const ROLE_MOT = { CLIENT: "client", DRIVER: "chauffeur" };

// Une course en cours bloque-t-elle la suppression ? Client : oui (un chauffeur est peut-être en
// route). Chauffeur : non, ses courses non terminées repartent chez le Dispatch.
export function courseEnCoursBloque(role) {
  return role === "CLIENT";
}

// Renvoie null si ce rôle peut demander la suppression de son compte, sinon le message à afficher.
export function motifDeRefus(role) {
  if (ROLES_AUTORISES.includes(role)) return null;
  if (role === "DISPATCH") {
    return "Le compte Dispatch ne peut pas être supprimé : c'est le compte principal de Taxi Sylvain.";
  }
  if (role === "ADMIN") {
    return "Un compte administrateur est géré par Taxi Sylvain. Demandez au Dispatch de le supprimer.";
  }
  return "Ce compte ne peut pas être supprimé ici. Contactez Taxi Sylvain.";
}

// Reçoit les courses de la personne ({ id, status }) et renvoie la première qui bloque, ou null.
export function courseEnCours(rides) {
  if (!Array.isArray(rides)) return null;
  return rides.find((ride) => RIDE_STATUSES_BLOQUANTS.includes(ride?.status)) || null;
}

export function messageCourseEnCours() {
  return "Vous avez une course en cours. Attendez qu'elle soit terminée ou faites-la annuler par Taxi Sylvain avant de supprimer votre compte.";
}

/** Une demande est-elle en attente sur ce compte ? */
export function demandeEnAttente(user) {
  return Boolean(user?.deletionRequestedAt);
}

/** Date limite de réponse promise à la personne. */
export function dateLimite(requestedAt) {
  return new Date(new Date(requestedAt).getTime() + DELAI_TRAITEMENT_JOURS * 86400000);
}

export function messageDemandeEnvoyee() {
  return `Votre demande de suppression a été envoyée à Taxi Sylvain. Elle sera traitée sous ${DELAI_TRAITEMENT_JOURS} jours et vous recevrez un courriel à la décision. D'ici là, votre compte reste utilisable et vous pouvez annuler la demande.`;
}

export function texteAlerteDispatch({ name, role, via }) {
  return `Demande de suppression de compte : ${name} (${ROLE_MOT[role] || role}), depuis ${via === "web" ? "la page web" : "l'application"}. À traiter dans la page Suppressions.`;
}

const DATE_FR = new Intl.DateTimeFormat("fr-CA", { timeZone: "America/Toronto", day: "numeric", month: "long", year: "numeric" });

function enveloppe(paragraphes) {
  const corps = paragraphes.map((p) => `<p style="margin:0 0 12px;color:#111827;font-size:15px">${p}</p>`).join("\n    ");
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#16233a;color:#f5a623;padding:16px 20px;border-radius:12px 12px 0 0;font-size:18px;font-weight:700">Taxi Sylvain</div>
  <div style="background:#ffffff;padding:20px;border-radius:0 0 12px 12px">
    ${corps}
  </div>
</div></body></html>`;
  return { html, text: paragraphes.join("\n\n") };
}

function bonjour(nom) {
  const prenom = String(nom || "").trim().split(/\s+/)[0];
  return prenom ? `Bonjour ${prenom},` : "Bonjour,";
}

/** Accusé de réception envoyé à la personne. */
export function courrielDemandeRecue({ nom, requestedAt }) {
  const limite = DATE_FR.format(dateLimite(requestedAt));
  return {
    subject: "Votre demande de suppression de compte Taxi Sylvain",
    ...enveloppe([
      bonjour(nom),
      `Nous avons bien reçu votre demande de suppression de compte. Taxi Sylvain la traitera au plus tard le ${limite} et vous écrira dès sa décision.`,
      "D'ici là, votre compte reste utilisable. Si vous changez d'avis, annulez la demande dans l'application (lien « Supprimer mon compte ») ou appelez le 438-499-1120.",
    ]),
  };
}

/** Décision du Dispatch envoyée à la personne. */
export function courrielDecision({ nom, approuvee, raison }) {
  if (approuvee) {
    return {
      subject: "Votre compte Taxi Sylvain a été supprimé",
      ...enveloppe([bonjour(nom), "Taxi Sylvain a validé votre demande : votre compte et vos renseignements personnels ont été supprimés. Vos courses effectuées restent dans nos registres, sans lien avec vous.", "Merci d'avoir voyagé avec Taxi Sylvain."]),
    };
  }
  return {
    subject: "Votre demande de suppression de compte n'a pas été acceptée",
    ...enveloppe([bonjour(nom), `Taxi Sylvain n'a pas accepté votre demande de suppression de compte${raison ? ` : ${raison}` : "."}`, "Votre compte reste actif. Pour en discuter, appelez le 438-499-1120."]),
  };
}

/** Alerte envoyée aux comptes Dispatch. */
export function courrielAlerteDispatch({ name, role, via, requestedAt }) {
  return {
    subject: `Demande de suppression de compte : ${name}`,
    ...enveloppe([
      "Bonjour,",
      `${name} (${ROLE_MOT[role] || role}) demande la suppression de son compte, depuis ${via === "web" ? "la page web" : "l'application"}, le ${DATE_FR.format(new Date(requestedAt))}.`,
      `À valider ou refuser dans la console, page Suppressions, avant le ${DATE_FR.format(dateLimite(requestedAt))}.`,
    ]),
  };
}
