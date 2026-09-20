// Inscription d'un client depuis l'application : le courriel ne doit jamais dépendre des majuscules.
// Sans cela, « Marie@exemple.ca » et « marie@exemple.ca » créeraient deux comptes, et un client
// inscrit avec une majuscule ne pourrait plus se connecter le lendemain.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "secret-de-test";

const { normaliserCourriel, chercherParCourriel } = await import("../src/routes/auth.js");

// Fausse base qui imite la recherche insensible à la casse de PostgreSQL.
function fakeDb(users) {
  return {
    dernierWhere: null,
    user: {
      findFirst: async function ({ where }) {
        db.dernierWhere = where;
        const cherche = where.email.mode === "insensitive" ? String(where.email.equals).toLowerCase() : where.email.equals;
        return users.find((u) => (where.email.mode === "insensitive" ? u.email.toLowerCase() : u.email) === cherche) || null;
      },
    },
  };
}
let db;

test("un courriel est rangé en minuscules, sans espace autour", () => {
  assert.equal(normaliserCourriel("  Marie.Tremblay@Exemple.CA "), "marie.tremblay@exemple.ca");
  assert.equal(normaliserCourriel(""), "");
  assert.equal(normaliserCourriel(undefined), "");
  assert.equal(normaliserCourriel(null), "");
});

test("un compte enregistré avec des majuscules est retrouvé quand on tape en minuscules", async () => {
  db = fakeDb([{ id: "u1", email: "Paul@Exemple.ca" }]);
  const trouve = await chercherParCourriel(db, "paul@exemple.ca");
  assert.equal(trouve?.id, "u1");
  assert.equal(db.dernierWhere.email.mode, "insensitive", "la recherche doit ignorer la casse");
});

test("les espaces tapés au clavier ne font pas échouer la connexion", async () => {
  db = fakeDb([{ id: "u2", email: "marie@exemple.ca" }]);
  assert.equal((await chercherParCourriel(db, "  marie@exemple.ca  "))?.id, "u2");
});

test("un courriel inconnu ne renvoie personne", async () => {
  db = fakeDb([{ id: "u3", email: "marie@exemple.ca" }]);
  assert.equal(await chercherParCourriel(db, "inconnu@exemple.ca"), null);
  assert.equal(await chercherParCourriel(db, ""), null);
});
