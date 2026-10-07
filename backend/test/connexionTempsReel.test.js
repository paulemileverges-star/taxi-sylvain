// Audit du 7 octobre 2026 (F01) : une seule connexion temps réel par application, même avec des
// appels simultanés, et aucune connexion survivante à une déconnexion de compte. Module pur partagé
// par les applications Chauffeur et Client (lib/connexionTempsReel.js), testé avec un faux Socket.io.
import { test } from "node:test";
import assert from "node:assert/strict";

const appli = (nom) => import(`../../apps/${nom}/src/lib/connexionTempsReel.js`);

function fauxSocketIo() {
  const ouverts = [];
  const ouvrir = (auth) => {
    const ecouteurs = new Map();
    const s = {
      auth, connecte: true, emis: [],
      on(e, f) { (ecouteurs.get(e) || ecouteurs.set(e, []).get(e)).push(f); return s; },
      off() { return s; },
      emit(e, d) { s.emis.push([e, d]); },
      removeAllListeners() { ecouteurs.clear(); },
      disconnect() { s.connecte = false; },
      connect() { s.connecte = true; },
      declencher(e, ...a) { for (const f of ecouteurs.get(e) || []) f(...a); },
    };
    ouverts.push(s);
    return s;
  };
  return { ouvrir, ouverts };
}

for (const nom of ["driver-app", "client-app"]) {
  test(`F01 (${nom}) : dix appels simultanés n'ouvrent qu'une connexion`, async () => {
    const { creerConnexion } = await appli(nom);
    const { ouvrir, ouverts } = fauxSocketIo();
    const c = creerConnexion({ ouvrir, lireJeton: () => new Promise((r) => setTimeout(() => r("jeton-a"), 10)) });
    const sockets = await Promise.all(Array.from({ length: 10 }, () => c.getSocket()));
    assert.equal(ouverts.length, 1);
    assert.ok(sockets.every((s) => s === ouverts[0]));
  });

  test(`F01 (${nom}) : une déconnexion pendant la lecture du jeton ne laisse aucune connexion`, async () => {
    const { creerConnexion, SOCKET_INACTIF } = await appli(nom);
    const { ouvrir, ouverts } = fauxSocketIo();
    let liberer;
    const c = creerConnexion({ ouvrir, lireJeton: () => new Promise((r) => { liberer = () => r("jeton-a"); }) });
    const attente = c.getSocket();
    c.resetSocket(); // déconnexion du compte pendant la lecture du stockage
    liberer();
    assert.equal(await attente, SOCKET_INACTIF);
    assert.equal(ouverts.length, 0, "aucune connexion ouverte pour l'ancien compte");
  });

  test(`F01 (${nom}) : après le compte A, le compte B a une connexion neuve et rien de A`, async () => {
    const { creerConnexion } = await appli(nom);
    const { ouvrir, ouverts } = fauxSocketIo();
    let jeton = "jeton-a";
    const c = creerConnexion({ ouvrir, lireJeton: async () => jeton });
    const a = await c.getSocket();
    await c.watchRide("course-de-a");
    c.resetSocket();
    assert.equal(a.connecte, false, "connexion de A fermée");
    jeton = "jeton-b";
    const b = await c.getSocket();
    assert.notEqual(a, b);
    b.declencher("connect");
    assert.ok(!b.emis.some(([e, id]) => e === "ride:watch" && id === "course-de-a"), "B ne suit pas la course de A");
    const auth = await new Promise((r) => b.auth(r));
    assert.deepEqual(auth, { token: "jeton-b" }, "jeton du moment à chaque connexion");
  });
}
