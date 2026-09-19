// Règles de suppression de compte (exigence Google Play : une personne doit pouvoir supprimer son
// compte depuis l'application ET depuis une page web, sans installer l'app). Module volontairement
// PUR — aucun accès à la base de données — pour deux raisons : les règles restent testables sans
// PostgreSQL, et elles sont écrites une seule fois pour la route de l'app et pour la route web.

// Une course dans ces états est commencée ou sur le point de l'être : elle ne peut pas perdre son
// client ou son chauffeur en cours de route. Tant qu'il en reste une, la suppression est refusée.
export const RIDE_STATUSES_BLOQUANTS = ["ACCEPTED", "EN_ROUTE", "STARTED"];

// Seuls les clients et les chauffeurs gèrent eux-mêmes la suppression de leur compte.
const ROLES_AUTORISES = ["CLIENT", "DRIVER"];

// Renvoie null si ce rôle a le droit de supprimer son compte, sinon le message français à
// afficher à la personne.
export function motifDeRefus(role) {
  if (ROLES_AUTORISES.includes(role)) return null;

  // Le compte Dispatch est le compte principal de Taxi Sylvain : le supprimer fermerait
  // l'entreprise (plus de tableau des courses, plus d'attribution de chauffeur).
  if (role === "DISPATCH") {
    return "Le compte Dispatch ne peut pas être supprimé : c'est le compte principal de Taxi Sylvain.";
  }

  // Un compte administrateur est créé par Taxi Sylvain avec des permissions choisies : c'est le
  // Dispatch qui le retire, pas l'administrateur lui-même.
  if (role === "ADMIN") {
    return "Un compte administrateur est géré par Taxi Sylvain. Demandez au Dispatch de le supprimer.";
  }

  // Rôle inconnu (ajouté plus tard, jeton bricolé...) : on refuse par défaut plutôt que de
  // supprimer un compte dont on ne connaît pas les conséquences.
  return "Ce compte ne peut pas être supprimé ici. Contactez Taxi Sylvain.";
}

// Reçoit les courses de la personne ({ id, status }) et renvoie la première qui bloque la
// suppression, ou null si aucune ne bloque.
export function courseEnCours(rides) {
  if (!Array.isArray(rides)) return null;
  return rides.find((ride) => RIDE_STATUSES_BLOQUANTS.includes(ride?.status)) || null;
}

// Message affiché quand une course est en cours : il doit dire quoi faire, pas seulement refuser.
export function messageCourseEnCours() {
  return "Vous avez une course en cours. Attendez qu'elle soit terminée ou faites-la annuler par Taxi Sylvain avant de supprimer votre compte.";
}
