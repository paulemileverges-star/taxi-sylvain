// Alertes d'erreurs par courriel, sans compte supplémentaire (passe par Brevo, déjà branché).
//
// Pourquoi : jusqu'au 6 octobre 2026, une erreur du serveur (route en échec, rappels de course
// bloqués, récap du lundi raté, sauvegarde manquée) ne laissait qu'une ligne dans les journaux de
// Railway, que personne ne lit. Désormais, la personne technique reçoit un courriel.
//
// Destinataires : ALERTES_COURRIEL (adresses séparées par des virgules) ; à défaut, les comptes
// Dispatch ayant un vrai courriel. Anti-avalanche : une erreur part tout de suite, les suivantes
// sont comptées et résumées dans un seul courriel au bout de 30 minutes (une base en panne
// déclenche une erreur par minute dans les rappels : jamais plus de deux courriels par heure).
import { isMailConfigured, sendMail } from "./mailer.js";
import { realEmailOrNull } from "./placeholderEmail.js";
import { FUSEAU_TAXI } from "./ridesOrder.js";

export const INTERVALLE_MS = 30 * 60 * 1000;

const HEURE = new Intl.DateTimeFormat("fr-CA", { timeZone: FUSEAU_TAXI, dateStyle: "long", timeStyle: "short" });

/** Adresses de ALERTES_COURRIEL, nettoyées (vide si la variable est absente ou mal remplie). */
export function adressesAlertes(brut = process.env.ALERTES_COURRIEL || "") {
  return String(brut).split(",").map((a) => a.trim()).filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
}

/** Texte d'une erreur pour le courriel : message et début de la pile, jamais plus de 1 500 caractères. */
export function decrireErreur(err) {
  if (err instanceof Error) return `${err.name}: ${err.message}\n${(err.stack || "").split("\n").slice(1, 8).join("\n")}`.slice(0, 1500);
  try { return JSON.stringify(err).slice(0, 1500); } catch { return String(err).slice(0, 1500); }
}

/** Contenu du courriel d'alerte. */
export function messageAlerte({ contexte, erreur, autres = 0, date = new Date() }) {
  const echapper = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const subject = `[Taxi Sylvain] Alerte serveur : ${contexte}`.slice(0, 150);
  const suite = autres > 0 ? `\n\n${autres} autre${autres > 1 ? "s" : ""} erreur${autres > 1 ? "s" : ""} depuis la dernière alerte (regroupées pour ne pas inonder la boîte).` : "";
  const text = `Le serveur de Taxi Sylvain a rencontré une erreur le ${HEURE.format(date)} (heure du Québec).\n\nOù : ${contexte}\n\n${erreur}${suite}\n\nJournaux complets : railway logs --service backend (ou le tableau de bord Railway, service backend, onglet Logs).`;
  const html = `<!doctype html><html lang="fr"><body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#111827">
<p>Le serveur de Taxi Sylvain a rencontré une erreur le <strong>${HEURE.format(date)}</strong> (heure du Québec).</p>
<p><strong>Où :</strong> ${echapper(contexte)}</p>
<pre style="background:#f3f4f6;padding:12px;border-radius:8px;white-space:pre-wrap;font-size:12px">${echapper(erreur)}</pre>
${autres > 0 ? `<p>${autres} autre${autres > 1 ? "s" : ""} erreur${autres > 1 ? "s" : ""} depuis la dernière alerte (regroupées pour ne pas inonder la boîte).</p>` : ""}
<p style="color:#6b7280;font-size:13px">Journaux complets : tableau de bord Railway, service backend, onglet Logs.</p>
</body></html>`;
  return { subject, text, html };
}

/**
 * Crée un émetteur d'alertes. `envoyer(message)` envoie réellement ; `maintenant` et `minuterie`
 * sont remplaçables pour les tests. Rend { signaler(contexte, err) }.
 */
export function creerAlerteur({ envoyer, maintenant = () => Date.now(), minuterie = setTimeout, intervalleMs = INTERVALLE_MS }) {
  let dernierEnvoi = -Infinity;
  let enAttente = null; // { contexte, erreur, nombre } : erreurs survenues depuis le dernier envoi
  let resumePrevu = false;

  const partir = async (contexte, erreur, autres) => {
    dernierEnvoi = maintenant();
    try {
      await envoyer(messageAlerte({ contexte, erreur, autres, date: new Date(dernierEnvoi) }));
    } catch (e) {
      console.error("Alerte non envoyée :", e?.message || e);
    }
  };

  const envoyerResume = () => {
    resumePrevu = false;
    if (!enAttente) return;
    const { contexte, erreur, nombre } = enAttente;
    enAttente = null;
    return partir(contexte, erreur, nombre - 1);
  };

  return {
    signaler(contexte, err) {
      const erreur = decrireErreur(err);
      if (maintenant() - dernierEnvoi >= intervalleMs) return partir(contexte, erreur, 0);
      // Dans la fenêtre : on compte, et un seul courriel de résumé partira à la fin de la fenêtre.
      enAttente = { contexte, erreur, nombre: (enAttente?.nombre || 0) + 1 };
      if (!resumePrevu) {
        resumePrevu = true;
        const t = minuterie(envoyerResume, Math.max(0, dernierEnvoi + intervalleMs - maintenant()));
        t?.unref?.();
      }
      return Promise.resolve();
    },
    envoyerResume,
  };
}

async function destinataires() {
  const adresses = adressesAlertes();
  if (adresses.length > 0) return adresses;
  // À défaut : les comptes Dispatch qui ont un vrai courriel. Import tardif : ce module est chargé
  // par httpSafety.js avant toute route, la base n'est utile qu'au moment d'une alerte.
  const { prisma } = await import("./prisma.js");
  const dispatchs = await prisma.user.findMany({ where: { role: "DISPATCH" }, select: { email: true } });
  return dispatchs.map((d) => realEmailOrNull(d.email)).filter(Boolean);
}

const alerteur = creerAlerteur({
  envoyer: async (message) => {
    if (!isMailConfigured()) return;
    for (const to of await destinataires()) await sendMail({ to, ...message });
  },
});

/** Journalise l'erreur et prévient par courriel (sans jamais lever d'exception). */
export function signalerErreur(contexte, err) {
  console.error(`${contexte} :`, err);
  return alerteur.signaler(contexte, err).catch(() => {});
}

/** Ligne affichée dans les journaux de Railway au démarrage. */
export function alertesStatusLine() {
  if (!isMailConfigured()) return "Alertes d'erreurs : inactives (courriels non configurés).";
  const adresses = adressesAlertes();
  return adresses.length > 0
    ? `Alertes d'erreurs : par courriel à ${adresses.join(", ")}.`
    : "Alertes d'erreurs : par courriel aux comptes Dispatch (ALERTES_COURRIEL non renseignée).";
}
