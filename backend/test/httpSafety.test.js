// Le serveur ne doit jamais s'arrêter à cause d'une erreur dans une route : avant le 19 septembre
// 2026, une seule requête (mot de passe envoyé sous forme de nombre, compte supprimé...) arrêtait
// toute l'API. On reproduit ces cas sur un petit serveur de test local.
import { installErrorHandler } from "../src/lib/httpSafety.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

let server;
let base;
const realError = console.error;

before(async () => {
  console.error = () => {}; // le filet journalise l'erreur : inutile de polluer la sortie des tests
  const app = express();
  app.use(express.json());
  app.get("/erreur-async", async () => {
    const err = new Error("Record to update not found.");
    err.code = "P2025"; // l'erreur Prisma qui arrêtait le serveur après une suppression de compte
    throw err;
  });
  app.post("/echo", (req, res) => res.json({ recu: req.body }));
  installErrorHandler(app);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  console.error = realError;
  server?.close();
});

test("une erreur dans une route async donne une réponse 500 au lieu d'arrêter le serveur", async () => {
  const res = await fetch(`${base}/erreur-async`);
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.match(body.error, /Erreur interne/);
  assert.ok(!body.error.includes("P2025"), "le détail technique ne doit pas partir vers l'utilisateur");
});

test("le serveur répond toujours après plusieurs erreurs de suite", async () => {
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await fetch(`${base}/erreur-async`)).status, 500);
  }
  const res = await fetch(`${base}/echo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"a":1}' });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).recu, { a: 1 });
});

test("un corps de requête mal formé est une erreur 400, pas une panne", async () => {
  const res = await fetch(`${base}/echo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{pas du json" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "Requête invalide.");
});
