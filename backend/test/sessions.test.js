// Sessions et identifiants : un compte supprimé ou un administrateur modifié ne doit plus pouvoir
// agir avec un ancien jeton, et les champs d'identification doivent être du texte.
import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "secret-de-test";

const { makeRequireAuth } = await import("../src/middleware/auth.js");
const { isText, publicUser } = await import("../src/routes/auth.js");

// Exécute le middleware sur une fausse requête et renvoie ce qui s'est passé.
function run(middleware, headers = {}) {
  return new Promise((resolve) => {
    const req = { headers };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body, req }); },
    };
    middleware(req, res, () => resolve({ status: "suivant", req }));
  });
}

const jeton = (payload) => `Bearer ${jwt.sign(payload, process.env.JWT_SECRET)}`;

test("sans jeton ou avec un faux jeton, l'accès est refusé", async () => {
  const mw = makeRequireAuth(async () => ({ id: "u1", role: "CLIENT", name: "X", permissions: [] }));
  assert.equal((await run(mw)).status, 401);
  assert.equal((await run(mw, { authorization: "Bearer n-importe-quoi" })).status, 401);
});

test("un compte supprimé est refusé même avec un jeton encore valable", async () => {
  const mw = makeRequireAuth(async () => null);
  const r = await run(mw, { authorization: jeton({ id: "supprime1", role: "CLIENT", name: "Ancien" }) });
  assert.equal(r.status, 401);
});

test("le rôle et les permissions viennent de la base, pas du jeton", async () => {
  // Jeton émis quand la personne était ADMIN avec la permission « drivers » ; depuis, le Dispatch
  // lui a retiré cette permission.
  const mw = makeRequireAuth(async (id) => ({ id, role: "ADMIN", name: "Collaborateur", permissions: ["courses"] }));
  const r = await run(mw, { authorization: jeton({ id: "adm1", role: "ADMIN", name: "Collaborateur", permissions: ["drivers"] }) });
  assert.equal(r.status, "suivant");
  assert.deepEqual(r.req.user, { id: "adm1", role: "ADMIN", name: "Collaborateur", permissions: ["courses"] });
});

test("seul du texte est accepté comme courriel ou mot de passe", () => {
  assert.equal(isText("abc"), true);
  for (const v of [123, 0, null, undefined, "", {}, [], true, { $ne: "" }]) {
    assert.equal(isText(v), false, `valeur acceptée à tort : ${JSON.stringify(v)}`);
  }
  assert.equal(isText("x".repeat(501)), false, "un texte démesuré est refusé");
});

test("le mémo interne du Dispatch n'est jamais renvoyé au client", () => {
  const vu = publicUser({ id: "c1", name: "Client", email: "c@x.ca", passwordHash: "h", notes: "Client difficile", pushToken: "ExponentPushToken[x]" });
  assert.equal(vu.notes, undefined);
  assert.equal(vu.passwordHash, undefined);
  assert.equal(vu.pushToken, undefined);
  assert.equal(vu.name, "Client");
});
