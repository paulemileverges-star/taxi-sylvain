import test from "node:test";
import assert from "node:assert/strict";
import { adressesAlertes, creerAlerteur, decrireErreur, messageAlerte, INTERVALLE_MS } from "../src/lib/alertes.js";

test("ALERTES_COURRIEL : adresses séparées par des virgules, les valeurs invalides sont écartées", () => {
  assert.deepEqual(adressesAlertes(" contact@taxisylvain.ca , autre@exemple.ca"), ["contact@taxisylvain.ca", "autre@exemple.ca"]);
  assert.deepEqual(adressesAlertes("pas-une-adresse, ,"), []);
  assert.deepEqual(adressesAlertes(""), []);
});

test("anti-avalanche : la première erreur part tout de suite, les suivantes sont résumées en un seul courriel", async () => {
  let horloge = 0;
  const envoyes = [];
  const minuteries = [];
  const alerteur = creerAlerteur({
    envoyer: async (m) => envoyes.push(m),
    maintenant: () => horloge,
    minuterie: (fn, delai) => { minuteries.push({ fn, delai }); return null; },
  });
  await alerteur.signaler("Rappels de course", new Error("base indisponible"));
  assert.equal(envoyes.length, 1);
  assert.doesNotMatch(envoyes[0].text, /autre/);

  // Une erreur par minute pendant 20 minutes : aucun courriel de plus, un seul résumé prévu.
  for (let i = 1; i <= 20; i += 1) { horloge = i * 60_000; await alerteur.signaler("Rappels de course", new Error("base indisponible")); }
  assert.equal(envoyes.length, 1);
  assert.equal(minuteries.length, 1);
  assert.equal(minuteries[0].delai, INTERVALLE_MS - 60_000, "le résumé part à la fin de la fenêtre de 30 minutes");

  horloge = INTERVALLE_MS;
  await minuteries[0].fn();
  assert.equal(envoyes.length, 2);
  assert.match(envoyes[1].text, /19 autres erreurs/);

  // Plus d'une fenêtre plus tard : la nouvelle erreur repart immédiatement.
  horloge = 3 * INTERVALLE_MS;
  await alerteur.signaler("Sauvegarde de la base", new Error("disque plein"));
  assert.equal(envoyes.length, 3);
  assert.match(envoyes[2].subject, /Sauvegarde de la base/);
});

test("une alerte qui ne part pas n'arrête jamais le serveur", async () => {
  const alerteur = creerAlerteur({ envoyer: async () => { throw new Error("Brevo en panne"); } });
  await assert.doesNotReject(alerteur.signaler("Test", new Error("x")));
});

test("contenu du courriel : contexte, erreur, HTML échappé, longueur bornée", () => {
  const erreur = decrireErreur(new Error("<script>alert(1)</script>"));
  const m = messageAlerte({ contexte: "Erreur non traitée sur GET /api/rides", erreur, date: new Date("2026-10-06T16:00:00Z") });
  assert.match(m.subject, /^\[Taxi Sylvain\] Alerte serveur : Erreur non traitée sur GET \/api\/rides$/);
  assert.match(m.text, /12 h 00|12:00/);
  assert.ok(!m.html.includes("<script>"));
  assert.ok(decrireErreur(new Error("x".repeat(5000))).length <= 1500);
  assert.match(decrireErreur({ code: "P1001" }), /P1001/);
});
