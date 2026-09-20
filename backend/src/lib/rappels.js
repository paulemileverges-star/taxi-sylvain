// Règles des rappels de course — fonctions pures, testables sans base de données.
//
// Trois besoins du propriétaire (20 septembre 2026), pour qu'un chauffeur ne manque jamais
// une course :
//   1. un courriel de rappel 80 minutes avant chaque course ;
//   2. des notifications et des sons qui fonctionnent vraiment ;
//   3. une escalade 60 minutes avant si le chauffeur n'est pas en ligne ou n'est pas en route :
//      appel vocal, notification spéciale, son d'urgence et courriel d'urgence.

/** Rappel par courriel : une seule fois, 80 minutes avant l'heure de prise en charge. */
export const COURRIEL_AVANT_MINUTES = 80;

/** Escalade : 60 minutes avant, si le chauffeur ne s'est pas mis en route. */
export const ESCALADE_AVANT_MINUTES = 60;

// Le serveur tourne chaque minute ; une fenêtre de grâce absorbe les à-coups sans jamais
// renvoyer un rappel oublié depuis longtemps (par exemple après un redémarrage).
export const FENETRE_GRACE_MS = 5 * 60 * 1000;

/** Un rappel est-il dû maintenant, pour un décalage donné ? */
export function rappelEstDu({ scheduledFor, offsetMinutes, now, fenetreMs = FENETRE_GRACE_MS }) {
  if (!scheduledFor) return false;
  const heure = new Date(scheduledFor).getTime();
  if (!Number.isFinite(heure)) return false;
  const cible = heure - offsetMinutes * 60 * 1000;
  const retard = new Date(now).getTime() - cible;
  return retard >= 0 && retard <= fenetreMs;
}

/**
 * Le chauffeur est-il en train de s'occuper de la course ?
 * « En route » ou « course démarrée » suffisent. Sinon, s'il n'est même pas en ligne, le risque
 * qu'il manque la course est réel : c'est ce que l'escalade sert à rattraper.
 */
export function chauffeurEnRoute(ride) {
  return ride?.status === "EN_ROUTE" || ride?.status === "STARTED";
}

export function escaladeNecessaire({ ride, enLigne, now }) {
  if (!ride?.driverId) return false; // aucune course confiée : c'est au Dispatch de l'affecter
  if (chauffeurEnRoute(ride)) return false;
  if (!rappelEstDu({ scheduledFor: ride.scheduledFor, offsetMinutes: ESCALADE_AVANT_MINUTES, now })) return false;
  // Hors ligne OU pas encore en route : les deux cas déclenchent, comme demandé.
  return !enLigne || !chauffeurEnRoute(ride);
}

/** « dans 1 h 20 », « dans 45 min » — écrit comme on le dirait. */
export function delaiEnMots(offsetMinutes) {
  if (offsetMinutes >= 60) {
    const heures = Math.floor(offsetMinutes / 60);
    const minutes = offsetMinutes % 60;
    return minutes ? `${heures} h ${minutes}` : `${heures} h`;
  }
  return `${offsetMinutes} min`;
}

export function messageRappel({ ride, pour, offsetMinutes }) {
  const quand = delaiEnMots(offsetMinutes);
  const trajet = `${ride.pickupAddress} → ${ride.destAddress}`;
  return pour === "client"
    ? { titre: "Course à venir", texte: `Votre course est prévue dans ${quand} : ${trajet}.` }
    : { titre: "Course à venir", texte: `Course prévue dans ${quand} : ${trajet}.` };
}

export function messageEscalade({ ride }) {
  const trajet = `${ride.pickupAddress} → ${ride.destAddress}`;
  return {
    titre: "URGENT — course dans 1 h",
    texte: `Vous n'êtes pas encore en route. Course dans 1 h : ${trajet}. Mettez-vous en route ou appelez Taxi Sylvain.`,
  };
}

/** Ce que le Dispatch voit quand une escalade se déclenche. */
export function alerteDispatch({ ride, nomChauffeur, enLigne }) {
  const trajet = `${ride.pickupAddress} → ${ride.destAddress}`;
  const etat = enLigne ? "en ligne mais pas encore en route" : "hors ligne";
  return `RAPPEL URGENT : ${nomChauffeur || "le chauffeur"} est ${etat} à 1 h de sa course (${trajet}). Rappel envoyé par notification, courriel et appel.`;
}
