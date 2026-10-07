#!/usr/bin/env node
// Vérification d'après mise en ligne — à lancer après chaque déploiement, avec :
//   node scripts/verifier-mise-en-ligne.mjs
//
// Pourquoi ce script existe : en septembre 2026, l'adresse publique de l'application client est
// restée figée neuf jours sur une ancienne version. Les corrections étaient bien livrées, mais
// l'adresse que Taxi Sylvain utilise pour tester servait un vieux fichier. Impossible à voir à
// l'œil nu. Ce script compare chaque adresse publique à la version réellement en production, et
// vérifie que le serveur accepte bien les appels venant de chacune d'elles (CORS) : une adresse
// oubliée dans CORS_ORIGIN affiche l'application, mais sans aucune donnée.
//
// Depuis l'audit du 7 octobre 2026 (OPS-04), « le serveur répond » ne suffit plus : la base doit
// répondre, le serveur doit tourner sur la version et la dernière migration du dépôt, la dernière
// sauvegarde doit avoir moins de 30 heures, aucun canal d'envoi (courriels, notifications) ne doit
// être en panne, et chaque site web doit servir le dernier commit de son application (marque posée
// par scripts/publier-web.mjs). Sinon la vérification échoue.

import fs from "node:fs";
import path from "node:path";
import { RACINE, commitWeb, historiqueComplet } from "./versions-web.mjs";

const API = process.env.API_URL || "https://backend-production-03f0b.up.railway.app";
// Adresse du serveur sur le domaine de l'entreprise, celle qu'utilisent les applications : depuis
// l'audit du 7 octobre 2026 (OPS-04), son indisponibilité fait ÉCHOUER la vérification.
const API_DOMAINE = "https://api.taxisylvain.ca";

// Version et dernière migration attendues : celles du dépôt (backend/src/version.js et le dernier
// dossier de backend/prisma/migrations). Un serveur resté sur une ancienne version fait échouer la
// vérification, au lieu de passer pour « à jour » parce qu'il répond.
function attendus() {
  try {
    const version = (fs.readFileSync(path.join(RACINE, "backend/src/version.js"), "utf8").match(/VERSION_SERVEUR\s*=\s*"([^"]+)"/) || [])[1] || null;
    const migration = fs.readdirSync(path.join(RACINE, "backend/prisma/migrations")).filter((d) => /^\d{14}_/.test(d)).sort().pop() || null;
    return { version, migration };
  } catch {
    return { version: null, migration: null };
  }
}

// adressePublique : un lien donné à Taxi Sylvain. adresseProduction : le domaine Vercel qui suit
// toujours le dernier déploiement du projet. Quand les deux servent un fichier différent, le lien
// public est figé sur une ancienne version.
const DISPATCH = "https://taxi-sylvain-dispatch.vercel.app";
const CHAUFFEUR = "https://taxi-sylvain-driver.vercel.app";
const CLIENT = "https://client-app-nine-pi.vercel.app";

// cle : l'application (scripts/versions-web.mjs) dont le site doit porter le dernier commit.
const SITES = [
  { nom: "Dispatch", cle: "dispatch", adressePublique: "https://dispatch.taxisylvain.ca", adresseProduction: DISPATCH },
  { nom: "Dispatch (ancienne adresse)", cle: "dispatch", adressePublique: DISPATCH, adresseProduction: DISPATCH },
  { nom: "Chauffeur", cle: "chauffeur", adressePublique: "https://chauffeur.taxisylvain.ca", adresseProduction: CHAUFFEUR },
  { nom: "Chauffeur (ancienne adresse)", cle: "chauffeur", adressePublique: CHAUFFEUR, adresseProduction: CHAUFFEUR },
  { nom: "Client", cle: "client", adressePublique: "https://client.taxisylvain.ca", adresseProduction: CLIENT },
  { nom: "Client (ancienne adresse)", cle: "client", adressePublique: "https://taxi-sylvain-client.vercel.app", adresseProduction: CLIENT },
];
// Le calcul du dernier commit d'une application demande tout l'historique Git.
const HISTORIQUE = historiqueComplet();

// Depuis le 20 septembre, la racine et www servent le site vitrine WordPress heberge chez LWS ;
// l'application client vit sur client.taxisylvain.ca. On verifie donc que ces deux adresses
// repondent ET qu'elles ne servent PAS l'application par erreur (retour en arriere silencieux).
const SITE_VITRINE = ["https://taxisylvain.ca", "https://www.taxisylvain.ca"];

const OK = "OK    ";
const KO = "ERREUR";

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    return { status: res.status, text: res.ok ? await res.text() : "" };
  } catch (err) {
    return { status: 0, text: "", error: err.name === "AbortError" ? "délai dépassé" : err.cause?.code || err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Chemin du fichier de code servi par le site ; son nom change à chaque nouvelle version. */
function bundlePath(html) {
  const match = html.match(/\/(?:_expo\/static\/js\/web|assets)\/[^"']+\.js/);
  return match ? match[0] : null;
}

function bundleName(html) {
  return bundlePath(html)?.split("/").pop() || null;
}

/** Le serveur accepte-t-il les appels venant de cette adresse web ? (pré-vérification CORS) */
async function corsAccepte(origine) {
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "OPTIONS",
      headers: { Origin: origine, "Access-Control-Request-Method": "POST" },
      signal: AbortSignal.timeout(20000),
    });
    return res.headers.get("access-control-allow-origin") === origine;
  } catch {
    return false;
  }
}

const problemes = [];
const productions = new Map(); // adresse de production -> chemin du fichier servi, lu une seule fois
const marques = new Map(); // adresse de production et commit -> le fichier servi porte-t-il ce commit ?

async function verifierApi() {
  const { status, error } = await fetchText(`${API}/health`);
  if (status === 200) {
    console.log(`${OK} Serveur : répond correctement.`);
  } else {
    console.log(`${KO} Serveur : pas de réponse (${error || `code ${status}`}).`);
    problemes.push("Le serveur ne répond pas — vérifier Railway.");
  }

  // Prêt à servir : la base répond, la version et la migration sont celles du dépôt, la dernière
  // sauvegarde a moins de 30 heures (route /health/ready, sans donnée personnelle).
  const domaine = API_DOMAINE.replace("https://", "");
  const pret = await fetchText(`${API_DOMAINE}/health/ready`);
  let etat = null;
  try { etat = JSON.parse(pret.text || "null"); } catch { etat = null; }
  if (pret.status === 404) {
    console.log(`${KO} Serveur sur ${domaine} : route /health/ready absente, le serveur en ligne est antérieur à la version du dépôt.`);
    problemes.push("Le serveur en ligne est sur une ancienne version : déploiement à faire (railway up depuis backend/).");
    return;
  }
  if (pret.status !== 200 || etat?.base !== "ok") {
    console.log(`${KO} Serveur sur ${domaine} : base de données ou serveur indisponible (${pret.error || `code ${pret.status}`}).`);
    problemes.push("Le serveur des applications ne peut pas servir (base de données ou serveur en panne) — vérifier Railway.");
    return;
  }
  console.log(`${OK} Serveur sur ${domaine} : base de données joignable.`);

  const { version, migration } = attendus();
  if (version && etat.version !== version) {
    console.log(`${KO} Version du serveur : ${etat.version || "inconnue"} en ligne, ${version} dans le dépôt.`);
    problemes.push("La version du serveur en ligne ne correspond pas à celle du dépôt : déployer (railway up depuis backend/) ou envoyer les commits sur GitHub.");
  } else if (version) {
    console.log(`${OK} Version du serveur : ${etat.version}, celle du dépôt.`);
  }
  if (migration && etat.migration !== migration) {
    console.log(`${KO} Migration de la base : ${etat.migration || "inconnue"} en ligne, ${migration} dans le dépôt.`);
    problemes.push("La base de production n'a pas la dernière migration du dépôt.");
  } else if (migration) {
    console.log(`${OK} Migration de la base : ${etat.migration}.`);
  }

  const s = etat.sauvegardes || {};
  if (typeof s.enRetard !== "boolean") {
    console.log(`${KO} Sauvegardes : état non communiqué par le serveur.`);
    problemes.push("Le serveur ne communique pas l'état des sauvegardes.");
  } else if (s.enRetard) {
    console.log(`${KO} Sauvegardes : la dernière a ${s.ageHeures ?? "?"} h (${s.nombre ?? 0} gardée(s)).`);
    problemes.push("Aucune sauvegarde de la base depuis plus de 30 heures — voir les journaux Railway.");
  } else {
    console.log(`${OK} Sauvegardes : la dernière a ${s.ageHeures} h (${s.nombre} gardée(s)).`);
  }

  // Envois réels des dernières 24 heures, sans message de test : un canal dont les derniers envois
  // ont tous échoué est en panne (clé de fournisseur expirée, service en erreur).
  const l = etat.livraisons;
  const NOMS = { courriel: "courriels", notification: "notifications de l'application", notificationWeb: "notifications web" };
  if (!l || !Array.isArray(l.enPanne)) {
    console.log(`${KO} Envois : état non communiqué par le serveur.`);
    problemes.push("Le serveur ne communique pas l'état des envois (courriels, notifications).");
  } else {
    const resume = Object.keys(NOMS).map((c) => `${NOMS[c]} ${l[c]?.envois ?? 0} (${l[c]?.echecs ?? 0} échec(s))`).join(", ");
    if (l.enPanne.length) {
      const enPanne = l.enPanne.map((c) => NOMS[c] || c).join(", ");
      console.log(`${KO} Envois sur 24 h : ${enPanne} EN PANNE (${resume}).`);
      problemes.push(`Envois en panne (${enPanne}) — vérifier la clé du fournisseur dans Railway et les journaux du serveur.`);
    } else {
      console.log(`${OK} Envois sur 24 h : ${resume}.`);
    }
  }
}

async function fichierDeProduction(adresse) {
  if (!productions.has(adresse)) productions.set(adresse, bundlePath((await fetchText(adresse)).text));
  return productions.get(adresse)?.split("/").pop() || null;
}

// Le fichier de code en ligne porte-t-il ce commit ? Il y est inscrit par scripts/publier-web.mjs.
async function porteLeCommit(adresseProduction, commit) {
  const cle = `${adresseProduction} ${commit}`;
  if (!marques.has(cle)) {
    const chemin = productions.get(adresseProduction);
    const { text } = chemin ? await fetchText(`${adresseProduction}${chemin}`, 60000) : { text: "" };
    marques.set(cle, text.includes(commit));
  }
  return marques.get(cle);
}

async function verifierSite(site) {
  const publique = await fetchText(site.adressePublique);
  if (publique.status !== 200) {
    console.log(`${KO} ${site.nom} : le site ne se charge pas (${publique.error || `code ${publique.status}`}).`);
    problemes.push(`${site.nom} : site injoignable.`);
    return;
  }

  const fichierPublic = bundleName(publique.text);
  if (!fichierPublic) {
    console.log(`${KO} ${site.nom} : page servie sans fichier de code identifiable.`);
    problemes.push(`${site.nom} : page anormale.`);
    return;
  }

  const fichierProduction = await fichierDeProduction(site.adresseProduction);
  if (!fichierProduction) {
    console.log(`${KO} ${site.nom} : impossible de lire la version de production.`);
    problemes.push(`${site.nom} : comparaison impossible.`);
    return;
  }

  if (fichierPublic !== fichierProduction) {
    console.log(`${KO} ${site.nom} : LE LIEN PUBLIC EST FIGÉ SUR UNE ANCIENNE VERSION.`);
    console.log(`       lien public   : ${fichierPublic}`);
    console.log(`       production    : ${fichierProduction}`);
    console.log(`       correction    : vercel alias set <dernier-deploiement> ${site.adressePublique.replace("https://", "")}`);
    problemes.push(`${site.nom} : lien public figé, les corrections ne sont pas visibles.`);
    return;
  }

  if (!(await corsAccepte(site.adressePublique))) {
    console.log(`${KO} ${site.nom} : à jour, mais le serveur REFUSE les appels venant de ${site.adressePublique}.`);
    console.log(`       correction    : ajouter cette adresse à CORS_ORIGIN dans Railway (service backend)`);
    problemes.push(`${site.nom} : adresse absente de CORS_ORIGIN, l'application ne peut pas se connecter.`);
    return;
  }

  // Le site sert-il le dernier commit de son application ? (sans tout l'historique Git, le calcul
  // est impossible : signalé une seule fois plus bas)
  const commit = HISTORIQUE ? commitWeb(site.cle) : null;
  if (HISTORIQUE && !commit) {
    console.log(`${KO} ${site.nom} : dernier commit de l'application introuvable dans le dépôt.`);
    problemes.push(`${site.nom} : contrôle de version impossible.`);
    return;
  }
  if (commit && !(await porteLeCommit(site.adresseProduction, commit))) {
    console.log(`${KO} ${site.nom} : en ligne, mais sans le dernier commit de l'application (${commit}).`);
    console.log(`       correction    : node scripts/publier-web.mjs ${site.cle} (ou envoyer les commits sur GitHub si la publication est plus récente)`);
    problemes.push(`${site.nom} : le site ne sert pas le dernier commit de l'application.`);
    return;
  }

  console.log(`${OK} ${site.nom} : ${site.adressePublique.replace("https://", "")} à jour (${fichierPublic}${commit ? `, commit ${commit}` : ""}) et autorisé par le serveur.`);
}

// Le site vitrine doit répondre, et ne doit pas servir l'application client.
async function verifierSiteVitrine() {
  for (const adresse of SITE_VITRINE) {
    const { status, text, error } = await fetchText(adresse);
    if (status !== 200) {
      console.log(`${KO} Site ${adresse.replace("https://", "")} : ne répond pas (${error || `code ${status}`}).`);
      problemes.push(`Le site ${adresse} ne répond pas — vérifier l'hébergement LWS.`);
      continue;
    }
    if (bundleName(text)) {
      console.log(`${KO} Site ${adresse.replace("https://", "")} : sert l'application client au lieu du site.`);
      problemes.push(`${adresse} est revenu sur Vercel : retirer ce domaine du projet client-app.`);
      continue;
    }
    console.log(`${OK} Site ${adresse.replace("https://", "")} : en ligne.`);
  }
}

// Pages légales exigées par Google Play, Apple et la Loi 25 : elles doivent toujours répondre.
async function verifierPagesLegales() {
  for (const page of ["/confidentialite", "/conditions", "/suppression-compte"]) {
    const { status, text, error } = await fetchText(`${API_DOMAINE}${page}`);
    if (status === 200 && /Taxi Sylvain/.test(text)) {
      console.log(`${OK} Page ${page} : en ligne.`);
    } else {
      console.log(`${KO} Page ${page} : absente (${error || `code ${status}`}).`);
      problemes.push(`Page légale ${page} introuvable : les magasins et la Loi 25 l'exigent.`);
    }
  }
}

console.log("Vérification de la version en ligne de Taxi Sylvain\n");
await verifierApi();
await verifierPagesLegales();
await verifierSiteVitrine();
if (!HISTORIQUE) {
  console.log(`${KO} Sites web : historique Git incomplet, impossible de calculer la version attendue de chaque application.`);
  problemes.push("Historique Git incomplet : la version des sites n'a pas été contrôlée (fetch-depth: 0 dans le workflow).");
}
for (const site of SITES) await verifierSite(site);

// Contrôle inverse : une adresse inconnue doit toujours être refusée par le serveur.
if (await corsAccepte("https://site-inconnu.example.com")) {
  console.log(`${KO} Sécurité : le serveur accepte les appels de n'importe quel site.`);
  problemes.push("CORS trop permissif : le serveur accepte un site inconnu.");
} else {
  console.log(`${OK} Sécurité : un site inconnu est bien refusé par le serveur.`);
}

console.log("");
if (problemes.length === 0) {
  console.log("Tout est en ligne : serveur, base, version et migration du dépôt, sauvegarde récente, applications web à jour.");
  process.exit(0);
}
console.log(`${problemes.length} problème(s) à régler :`);
for (const p of problemes) console.log(` - ${p}`);
process.exit(1);
