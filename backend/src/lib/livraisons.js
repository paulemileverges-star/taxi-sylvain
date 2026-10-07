// Compteurs des envois sortants (courriels, notifications de l'application installée, notifications
// web) sur les dernières 24 heures, lus par la surveillance via /health/ready (audit du 7 octobre
// 2026, OPS-04 : une clé de fournisseur expirée faisait échouer tous les envois sans que rien ne le
// signale). Aucun message de test n'est envoyé : seuls les envois réels sont comptés.
//
// Seule une panne du CANAL compte comme échec (fournisseur injoignable, clé refusée, erreur du
// service) ; une adresse invalide ou un téléphone qui a désinstallé l'application ne disent rien de
// l'état du canal et ne sont pas comptés. Gardé en mémoire, sans aucune donnée personnelle (une
// heure et un résultat par envoi) : un redémarrage du serveur remet les compteurs à zéro.

export const CANAUX = ["courriel", "notification", "notificationWeb"];
const FENETRE_MS = 24 * 60 * 60 * 1000;
const MAX_PAR_CANAL = 2000;
// Un canal est « en panne » quand ses derniers envois ont tous échoué, au moins ce nombre de fois de
// suite : un échec isolé (coupure réseau passagère) ne déclenche pas d'alerte.
export const ECHECS_POUR_PANNE = 3;

const journal = new Map(CANAUX.map((canal) => [canal, []]));

function elaguer(liste, maintenant) {
  while (liste.length && (liste.length > MAX_PAR_CANAL || liste[0].le < maintenant - FENETRE_MS)) liste.shift();
}

/** Note un envoi réussi ou une panne du canal. */
export function noterEnvoi(canal, reussi, maintenant = Date.now()) {
  const liste = journal.get(canal);
  if (!liste) return;
  liste.push({ le: maintenant, reussi: Boolean(reussi) });
  elaguer(liste, maintenant);
}

/** État par canal sur 24 heures, et la liste des canaux en panne. */
export function etatLivraisons(maintenant = Date.now()) {
  const etat = { enPanne: [] };
  for (const [canal, liste] of journal) {
    elaguer(liste, maintenant);
    let echecsDeSuite = 0;
    for (let i = liste.length - 1; i >= 0 && !liste[i].reussi; i -= 1) echecsDeSuite += 1;
    const dernierEchec = [...liste].reverse().find((e) => !e.reussi);
    etat[canal] = {
      envois: liste.length,
      echecs: liste.filter((e) => !e.reussi).length,
      echecsDeSuite,
      dernierEchecLe: dernierEchec ? new Date(dernierEchec.le).toISOString() : null,
    };
    if (echecsDeSuite >= ECHECS_POUR_PANNE) etat.enPanne.push(canal);
  }
  return etat;
}

/** Pour les tests : repart d'un journal vide. */
export function viderLivraisons() {
  for (const liste of journal.values()) liste.length = 0;
}
