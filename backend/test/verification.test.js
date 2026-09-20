// Confirmation du courriel par code à six chiffres (demande du propriétaire du 20 septembre 2026 :
// « les créations de nouveaux comptes chauffeurs et clients devront se faire par authentification
// ou confirmation de code envoyé par courriel »).
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "secret-de-test";

const {
  CODE_VALIDITE_MS, DELAI_RENVOI_MS, TENTATIVES_MAX,
  genererCode, hacherCode, formatDeCodeValide, confirmationRequise, etatDuCode, renvoiTropTot,
  messageDuCode, demanderCode, verifierCode, messagePourEtat,
} = await import("../src/lib/verification.js");

const NOW = new Date("2026-09-20T15:00:00Z");
const client = () => ({ id: "c1", role: "CLIENT", name: "Marie Tremblay", email: "marie@exemple.ca", emailVerifiedAt: null });

// Fausse base : une table de codes et une table de comptes, avec les seules opérations utilisées.
function fakeDb(users = [client()]) {
  const codes = new Map();
  return {
    codes,
    users,
    emailVerification: {
      findUnique: async ({ where }) => codes.get(where.userId) || null,
      upsert: async ({ where, update, create }) => {
        const existante = codes.get(where.userId);
        codes.set(where.userId, existante ? { ...existante, ...update } : { id: "v1", ...create });
      },
      update: async ({ where, data }) => {
        const e = codes.get(where.userId);
        e.attempts += data.attempts.increment;
      },
      deleteMany: async ({ where }) => { codes.delete(where.userId); },
    },
    user: {
      update: async ({ where, data }) => {
        const u = users.find((x) => x.id === where.id);
        Object.assign(u, data);
        return u;
      },
    },
  };
}

test("le code a six chiffres, toujours, même quand le tirage commence par des zéros", () => {
  assert.equal(genererCode(() => 42), "000042");
  assert.equal(genererCode(() => 999999), "999999");
  assert.match(genererCode(), /^\d{6}$/);
  assert.equal(formatDeCodeValide("123456"), true);
  assert.equal(formatDeCodeValide(" 123456 "), true, "les espaces autour sont tolérés");
  assert.equal(formatDeCodeValide("12345"), false);
  assert.equal(formatDeCodeValide("abcdef"), false);
  assert.equal(formatDeCodeValide(123456), false, "un nombre n'est pas accepté tel quel");
});

test("le code n'est jamais gardé en clair : l'empreinte dépend du compte", () => {
  const a = hacherCode("123456", "c1");
  assert.notEqual(a, "123456");
  assert.equal(a, hacherCode(" 123456 ", "c1"));
  assert.notEqual(a, hacherCode("123456", "c2"), "le même code ne vaut pas pour un autre compte");
});

test("qui doit confirmer : un nouveau compte avec un vrai courriel, quand les courriels marchent", () => {
  assert.equal(confirmationRequise(client(), { mailConfigure: true }), true);
  assert.equal(confirmationRequise({ ...client(), emailVerifiedAt: NOW }, { mailConfigure: true }), false, "déjà confirmé");
  assert.equal(confirmationRequise({ ...client(), role: "DISPATCH" }, { mailConfigure: true }), false, "le Dispatch n'est jamais bloqué");
  assert.equal(confirmationRequise({ ...client(), email: "client-ab12@reservation.taxisylvain.local" }, { mailConfigure: true }), false, "réservation par téléphone : pas de vrai courriel");
  assert.equal(confirmationRequise(client(), { mailConfigure: false }), false, "sans service de courriel, personne n'est bloqué");
  assert.equal(confirmationRequise({ ...client(), role: "DRIVER" }, { mailConfigure: true }), true, "un chauffeur créé par le Dispatch confirme à sa première connexion");
  assert.equal(confirmationRequise({ ...client(), role: "ADMIN" }, { mailConfigure: true }), true);
  assert.equal(confirmationRequise(null, { mailConfigure: true }), false);
});

test("état d'un code : valide, incorrect, expiré, bloqué, absent", () => {
  const entree = { userId: "c1", codeHash: hacherCode("123456", "c1"), expiresAt: new Date(NOW.getTime() + CODE_VALIDITE_MS), attempts: 0, sentAt: NOW };
  assert.equal(etatDuCode(entree, "123456", NOW), "valide");
  assert.equal(etatDuCode(entree, "654321", NOW), "invalide");
  assert.equal(etatDuCode(entree, "12", NOW), "invalide");
  assert.equal(etatDuCode(entree, "123456", new Date(entree.expiresAt.getTime() + 1)), "expire");
  assert.equal(etatDuCode({ ...entree, attempts: TENTATIVES_MAX }, "123456", NOW), "bloque", "le bon code ne passe plus après trop d'essais");
  assert.equal(etatDuCode(null, "123456", NOW), "absent");
  assert.equal(CODE_VALIDITE_MS, 15 * 60 * 1000);
  assert.equal(TENTATIVES_MAX, 5);
});

test("pas de rafale : un nouveau code ne part pas moins d'une minute après le précédent", () => {
  const entree = { sentAt: NOW };
  assert.equal(renvoiTropTot(entree, new Date(NOW.getTime() + 30 * 1000)), true);
  assert.equal(renvoiTropTot(entree, new Date(NOW.getTime() + DELAI_RENVOI_MS)), false);
  assert.equal(renvoiTropTot(null, NOW), false);
});

test("le courriel contient le code, le prénom et la durée de validité", () => {
  const { subject, html, text } = messageDuCode({ nom: "Marie Tremblay", code: "080912" });
  assert.match(subject, /080912/);
  assert.match(html, /Bonjour Marie,/);
  assert.match(html, /080912/);
  assert.match(text, /080912/);
  assert.match(text, /15 minutes/);
});

test("demander un code : il est enregistré (empreinte) et envoyé au vrai courriel", async () => {
  const db = fakeDb();
  const envois = [];
  const envoyer = async (m) => { envois.push(m); return { ok: true }; };
  const r = await demanderCode(client(), { db, envoyer, now: NOW, aleatoire: () => 123456 });
  assert.deepEqual(r, { envoye: true });
  assert.equal(envois.length, 1);
  assert.equal(envois[0].to, "marie@exemple.ca");
  assert.match(envois[0].text, /123456/);
  const entree = db.codes.get("c1");
  assert.equal(entree.codeHash, hacherCode("123456", "c1"));
  assert.equal(JSON.stringify(entree).includes("123456"), false, "le code en clair n'est pas en base");
  assert.equal(entree.expiresAt.getTime(), NOW.getTime() + CODE_VALIDITE_MS);
});

test("demander un code deux fois de suite : le second est retenu, sauf si on force", async () => {
  const db = fakeDb();
  const envois = [];
  const envoyer = async (m) => { envois.push(m); return { ok: true }; };
  await demanderCode(client(), { db, envoyer, now: NOW, aleatoire: () => 111111 });
  const tropTot = await demanderCode(client(), { db, envoyer, now: new Date(NOW.getTime() + 10_000), aleatoire: () => 222222 });
  assert.deepEqual(tropTot, { envoye: false, raison: "trop-tot" });
  assert.equal(envois.length, 1);
  const force = await demanderCode(client(), { db, envoyer, now: new Date(NOW.getTime() + 10_000), forcer: true, aleatoire: () => 333333 });
  assert.deepEqual(force, { envoye: true });
  assert.equal(envois.length, 2);
  assert.equal(db.codes.get("c1").codeHash, hacherCode("333333", "c1"), "le dernier code envoyé remplace le précédent");
});

test("sans vrai courriel, ou si l'envoi échoue, rien ne lève et la raison est dite", async () => {
  const db = fakeDb();
  assert.deepEqual(await demanderCode({ ...client(), email: "x@reservation.taxisylvain.local" }, { db, envoyer: async () => ({ ok: true }), now: NOW }), { envoye: false, raison: "sans-courriel" });
  const r = await demanderCode(client(), { db, envoyer: async () => ({ ok: false, error: "fournisseur en panne" }), now: NOW });
  assert.deepEqual(r, { envoye: false, raison: "fournisseur en panne" });
});

test("le bon code confirme le compte et efface le code ; un mauvais code compte un essai", async () => {
  const db = fakeDb();
  await demanderCode(client(), { db, envoyer: async () => ({ ok: true }), now: NOW, aleatoire: () => 123456 });
  assert.equal(await verifierCode(client(), "999999", { db, now: NOW }), "invalide");
  assert.equal(db.codes.get("c1").attempts, 1);
  assert.equal(db.users[0].emailVerifiedAt, null, "pas confirmé après un mauvais code");

  assert.equal(await verifierCode(client(), "123456", { db, now: NOW }), "valide");
  assert.equal(db.users[0].emailVerifiedAt.getTime(), NOW.getTime());
  assert.equal(db.codes.has("c1"), false, "le code est à usage unique");
  assert.equal(await verifierCode(client(), "123456", { db, now: NOW }), "absent", "le même code ne sert pas deux fois");
});

test("après cinq essais ratés, même le bon code est refusé jusqu'à un nouveau code", async () => {
  const db = fakeDb();
  await demanderCode(client(), { db, envoyer: async () => ({ ok: true }), now: NOW, aleatoire: () => 123456 });
  for (let i = 0; i < TENTATIVES_MAX; i += 1) assert.equal(await verifierCode(client(), "000000", { db, now: NOW }), "invalide");
  assert.equal(await verifierCode(client(), "123456", { db, now: NOW }), "bloque");
  const plusTard = new Date(NOW.getTime() + DELAI_RENVOI_MS);
  await demanderCode(client(), { db, envoyer: async () => ({ ok: true }), now: plusTard, aleatoire: () => 654321 });
  assert.equal(await verifierCode(client(), "654321", { db, now: plusTard }), "valide", "un nouveau code remet le compteur à zéro");
});

test("un code expiré est refusé avec un message clair", async () => {
  const db = fakeDb();
  await demanderCode(client(), { db, envoyer: async () => ({ ok: true }), now: NOW, aleatoire: () => 123456 });
  const tard = new Date(NOW.getTime() + CODE_VALIDITE_MS + 1);
  assert.equal(await verifierCode(client(), "123456", { db, now: tard }), "expire");
  assert.match(messagePourEtat("expire"), /expiré/);
  assert.match(messagePourEtat("bloque"), /Trop d'essais/);
  assert.match(messagePourEtat("invalide"), /incorrect/);
  assert.match(messagePourEtat("absent"), /Aucun code/);
});

test("messages de la route : code envoyé, code déjà envoyé, envoi impossible", async () => {
  const { messageDemandeDeCode } = await import("../src/routes/auth.js");
  assert.match(messageDemandeDeCode({ envoye: true }, "marie@exemple.ca"), /marie@exemple\.ca/);
  assert.match(messageDemandeDeCode({ envoye: false, raison: "trop-tot" }, "marie@exemple.ca"), /moins d'une minute/);
  assert.match(messageDemandeDeCode({ envoye: false, raison: "panne" }, "marie@exemple.ca"), /n'a pas pu être envoyé/);
});
