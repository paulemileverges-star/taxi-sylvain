#!/usr/bin/env node
// Vérification d'après mise en ligne — à lancer après chaque déploiement, avec :
//   node scripts/verifier-mise-en-ligne.mjs
//
// Pourquoi ce script existe : en septembre 2026, l'adresse publique de l'application client est
// restée figée neuf jours sur une ancienne version. Les corrections étaient bien livrées, mais
// l'adresse que Taxi Sylvain utilise pour tester servait un vieux fichier. Impossible à voir à
// l'œil nu. Ce script compare l'adresse publique à la version réellement en production et le dit.

const API = process.env.API_URL || "https://backend-production-03f0b.up.railway.app";

// adressePublique : le lien donné à Taxi Sylvain. adresseProduction : le domaine Vercel qui suit
// toujours le dernier déploiement du projet. Quand les deux servent un fichier différent, le lien
// public est figé sur une ancienne version.
const SITES = [
  { nom: "Dispatch", adressePublique: "https://taxi-sylvain-dispatch.vercel.app", adresseProduction: "https://taxi-sylvain-dispatch.vercel.app", projet: "taxi-sylvain-dispatch" },
  { nom: "Chauffeur", adressePublique: "https://taxi-sylvain-driver.vercel.app", adresseProduction: "https://taxi-sylvain-driver.vercel.app", projet: "taxi-sylvain-driver" },
  { nom: "Client", adressePublique: "https://taxi-sylvain-client.vercel.app", adresseProduction: "https://client-app-nine-pi.vercel.app", projet: "client-app" },
];

const OK = "OK   ";
const KO = "ERREUR";

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    return { status: res.status, text: res.ok ? await res.text() : "" };
  } catch (err) {
    return { status: 0, text: "", error: err.name === "AbortError" ? "délai dépassé" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Nom du fichier de code servi par le site : il change à chaque nouvelle version. */
function bundleName(html) {
  const match = html.match(/\/(?:_expo\/static\/js\/web|assets)\/[^"']+\.js/);
  return match ? match[0].split("/").pop() : null;
}

const problemes = [];

async function verifierApi() {
  const { status, error } = await fetchText(`${API}/health`);
  if (status === 200) {
    console.log(`${OK} Serveur : répond correctement.`);
  } else {
    console.log(`${KO} Serveur : pas de réponse (${error || `code ${status}`}).`);
    problemes.push("Le serveur ne répond pas — vérifier Railway.");
  }
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

  if (site.adresseProduction === site.adressePublique) {
    console.log(`${OK} ${site.nom} : en ligne, version ${fichierPublic}.`);
    return;
  }

  const production = await fetchText(site.adresseProduction);
  const fichierProduction = bundleName(production.text);
  if (!fichierProduction) {
    console.log(`${KO} ${site.nom} : impossible de lire la version de production.`);
    problemes.push(`${site.nom} : comparaison impossible.`);
    return;
  }

  if (fichierPublic === fichierProduction) {
    console.log(`${OK} ${site.nom} : le lien public sert bien la dernière version (${fichierPublic}).`);
  } else {
    console.log(`${KO} ${site.nom} : LE LIEN PUBLIC EST FIGÉ SUR UNE ANCIENNE VERSION.`);
    console.log(`       lien public   : ${fichierPublic}`);
    console.log(`       production    : ${fichierProduction}`);
    console.log(`       correction    : vercel alias set <dernier-deploiement> ${site.adressePublique.replace("https://", "")}`);
    problemes.push(`${site.nom} : lien public figé, les corrections ne sont pas visibles.`);
  }
}

console.log("Vérification de la version en ligne de Taxi Sylvain\n");
await verifierApi();
for (const site of SITES) await verifierSite(site);

console.log("");
if (problemes.length === 0) {
  console.log("Tout est en ligne et à jour.");
  process.exit(0);
}
console.log(`${problemes.length} problème(s) à régler :`);
for (const p of problemes) console.log(` - ${p}`);
process.exit(1);
