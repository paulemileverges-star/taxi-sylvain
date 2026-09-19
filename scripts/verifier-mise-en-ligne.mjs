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

const API = process.env.API_URL || "https://backend-production-03f0b.up.railway.app";
// Adresse du serveur sur le domaine de l'entreprise. Tant qu'elle n'est pas utilisée par les
// applications, son absence est signalée sans faire échouer la vérification.
const API_DOMAINE = "https://api.taxisylvain.ca";

// adressePublique : un lien donné à Taxi Sylvain. adresseProduction : le domaine Vercel qui suit
// toujours le dernier déploiement du projet. Quand les deux servent un fichier différent, le lien
// public est figé sur une ancienne version.
const DISPATCH = "https://taxi-sylvain-dispatch.vercel.app";
const CHAUFFEUR = "https://taxi-sylvain-driver.vercel.app";
const CLIENT = "https://client-app-nine-pi.vercel.app";

const SITES = [
  { nom: "Dispatch", adressePublique: "https://dispatch.taxisylvain.ca", adresseProduction: DISPATCH },
  { nom: "Dispatch (ancienne adresse)", adressePublique: DISPATCH, adresseProduction: DISPATCH },
  { nom: "Chauffeur", adressePublique: "https://chauffeur.taxisylvain.ca", adresseProduction: CHAUFFEUR },
  { nom: "Chauffeur (ancienne adresse)", adressePublique: CHAUFFEUR, adresseProduction: CHAUFFEUR },
  { nom: "Client", adressePublique: "https://client.taxisylvain.ca", adresseProduction: CLIENT },
  { nom: "Client (taxisylvain.ca)", adressePublique: "https://taxisylvain.ca", adresseProduction: CLIENT },
  { nom: "Client (www)", adressePublique: "https://www.taxisylvain.ca", adresseProduction: CLIENT },
  { nom: "Client (ancienne adresse)", adressePublique: "https://taxi-sylvain-client.vercel.app", adresseProduction: CLIENT },
];

const OK = "OK    ";
const KO = "ERREUR";
const AV = "ATTENTION";

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

/** Nom du fichier de code servi par le site : il change à chaque nouvelle version. */
function bundleName(html) {
  const match = html.match(/\/(?:_expo\/static\/js\/web|assets)\/[^"']+\.js/);
  return match ? match[0].split("/").pop() : null;
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
const avertissements = [];
const productions = new Map(); // adresse de production -> fichier servi, lu une seule fois

async function verifierApi() {
  const { status, error } = await fetchText(`${API}/health`);
  if (status === 200) {
    console.log(`${OK} Serveur : répond correctement.`);
  } else {
    console.log(`${KO} Serveur : pas de réponse (${error || `code ${status}`}).`);
    problemes.push("Le serveur ne répond pas — vérifier Railway.");
  }

  const domaine = await fetchText(`${API_DOMAINE}/health`);
  if (domaine.status === 200) {
    console.log(`${OK} Serveur sur ${API_DOMAINE.replace("https://", "")} : répond correctement.`);
  } else {
    console.log(`${AV} Serveur sur ${API_DOMAINE.replace("https://", "")} : pas encore joignable (${domaine.error || `code ${domaine.status}`}).`);
    avertissements.push(`${API_DOMAINE} n'est pas encore actif (validation du domaine chez Railway).`);
  }
}

async function fichierDeProduction(adresse) {
  if (!productions.has(adresse)) productions.set(adresse, bundleName((await fetchText(adresse)).text));
  return productions.get(adresse);
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

  console.log(`${OK} ${site.nom} : ${site.adressePublique.replace("https://", "")} à jour (${fichierPublic}) et autorisé par le serveur.`);
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
for (const site of SITES) await verifierSite(site);

// Contrôle inverse : une adresse inconnue doit toujours être refusée par le serveur.
if (await corsAccepte("https://site-inconnu.example.com")) {
  console.log(`${KO} Sécurité : le serveur accepte les appels de n'importe quel site.`);
  problemes.push("CORS trop permissif : le serveur accepte un site inconnu.");
} else {
  console.log(`${OK} Sécurité : un site inconnu est bien refusé par le serveur.`);
}

console.log("");
for (const a of avertissements) console.log(`À noter : ${a}`);
if (problemes.length === 0) {
  console.log("Tout est en ligne et à jour.");
  process.exit(0);
}
console.log(`${problemes.length} problème(s) à régler :`);
for (const p of problemes) console.log(` - ${p}`);
process.exit(1);
