import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import express from "express";
import {
  nomSauvegarde, trierSauvegardes, aEffacer, ageDerniereHeures, ordreInsertion, lireFichierSauvegarde, fichiersPublics, FORMAT,
} from "../src/lib/sauvegarde.js";

test("le nom de la sauvegarde suit l'heure du Québec, été comme hiver", () => {
  assert.equal(nomSauvegarde(new Date("2026-10-06T07:30:00Z")), "taxi-sylvain-2026-10-06-0330.json.gz"); // HAE, UTC-4
  assert.equal(nomSauvegarde(new Date("2026-12-01T08:30:00Z")), "taxi-sylvain-2026-12-01-0330.json.gz"); // HNE, UTC-5
  assert.equal(nomSauvegarde(new Date("2026-10-07T03:59:00Z")), "taxi-sylvain-2026-10-06-2359.json.gz"); // encore le 6 au Québec
});

test("garde les 14 plus récentes et ne touche jamais un autre fichier", () => {
  const sauvegardes = Array.from({ length: 16 }, (_, i) => `taxi-sylvain-2026-10-${String(i + 1).padStart(2, "0")}-0330.json.gz`);
  const autres = ["notes.txt", "taxi-sylvain-2026-09-01-0330.json.gz.partiel", "photo.jpg"];
  const effacees = aEffacer([...autres, ...sauvegardes]);
  assert.deepEqual(effacees, ["taxi-sylvain-2026-10-02-0330.json.gz", "taxi-sylvain-2026-10-01-0330.json.gz"]);
  assert.equal(trierSauvegardes([...autres, ...sauvegardes])[0], "taxi-sylvain-2026-10-16-0330.json.gz");
  assert.deepEqual(aEffacer(["taxi-sylvain-2026-10-01-0330.json.gz"], 0), [], "on garde toujours au moins la plus récente");
});

test("âge de la dernière sauvegarde : rattrapage au démarrage seulement si elle est ancienne", () => {
  const maintenant = new Date("2026-10-06T16:00:00Z"); // 12 h au Québec
  assert.equal(ageDerniereHeures(["taxi-sylvain-2026-10-06-0330.json.gz"], maintenant), 8.5);
  assert.equal(ageDerniereHeures(["taxi-sylvain-2026-10-04-0330.json.gz", "taxi-sylvain-2026-10-05-0330.json.gz"], maintenant), 32.5);
  assert.equal(ageDerniereHeures([], maintenant), Infinity);
});

test("restauration : chaque table est insérée après celles qu'elle référence", () => {
  const tables = ["Rating", "Ride", "User", "Destination", "Message"];
  const liens = [
    { enfant: "Ride", parent: "User" }, { enfant: "Rating", parent: "Ride" }, { enfant: "Rating", parent: "User" },
    { enfant: "Message", parent: "Ride" }, { enfant: "Message", parent: "User" }, { enfant: "User", parent: "User" },
  ];
  const ordre = ordreInsertion(tables, liens);
  assert.equal(ordre.length, 5);
  for (const { enfant, parent } of liens) if (enfant !== parent) assert.ok(ordre.indexOf(parent) < ordre.indexOf(enfant), `${parent} avant ${enfant}`);
  assert.throws(() => ordreInsertion(["A", "B"], [{ enfant: "A", parent: "B" }, { enfant: "B", parent: "A" }]), /circulaires/);
});

test("un fichier de sauvegarde incomplet ou étranger est refusé", () => {
  const gz = (o) => zlib.gzipSync(Buffer.from(JSON.stringify(o)));
  const bon = { format: FORMAT, version: 1, creeLe: "2026-10-06T07:30:00.000Z", migrations: [], comptes: { User: 1 }, tables: { User: [{ id: "u1" }] } };
  assert.equal(lireFichierSauvegarde(gz(bon)).tables.User[0].id, "u1");
  assert.throws(() => lireFichierSauvegarde(gz({ ...bon, format: "autre" })), /pas une sauvegarde/);
  assert.throws(() => lireFichierSauvegarde(gz({ ...bon, comptes: { User: 2 } })), /incomplète/);
});

test("le dossier caché des sauvegardes n'est jamais servi sous /uploads, même par une adresse déguisée", async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "ts-uploads-"));
  fs.mkdirSync(path.join(dossier, ".sauvegardes"));
  fs.mkdirSync(path.join(dossier, "apk"));
  fs.writeFileSync(path.join(dossier, ".sauvegardes", "taxi-sylvain-2026-10-06-0330.json.gz"), "SECRET");
  fs.writeFileSync(path.join(dossier, "photo-chauffeur.jpg"), "JPEG");
  fs.writeFileSync(path.join(dossier, "apk", "Taxi-Sylvain-Client-1.4.0.apk"), "APK");
  const app = express();
  app.use("/uploads", fichiersPublics(dossier));
  const serveur = app.listen(0);
  const base = `http://127.0.0.1:${serveur.address().port}`;
  try {
    const photo = await fetch(`${base}/uploads/photo-chauffeur.jpg`);
    assert.equal(photo.status, 200);
    assert.match(photo.headers.get("content-security-policy"), /sandbox/);
    const apk = await fetch(`${base}/uploads/apk/Taxi-Sylvain-Client-1.4.0.apk`);
    assert.equal(apk.status, 200);
    assert.match(apk.headers.get("content-disposition"), /Taxi-Sylvain-Client-1\.4\.0\.apk/);
    for (const chemin of [
      "/uploads/.sauvegardes/taxi-sylvain-2026-10-06-0330.json.gz",
      "/uploads/%2Esauvegardes/taxi-sylvain-2026-10-06-0330.json.gz",
      "/uploads/%2esauvegardes/taxi-sylvain-2026-10-06-0330.json.gz",
      "/uploads/apk/..%2F.sauvegardes/taxi-sylvain-2026-10-06-0330.json.gz",
      "/uploads/.sauvegardes/",
    ]) {
      const r = await fetch(base + chemin);
      const corps = await r.text();
      assert.notEqual(r.status, 200, chemin);
      assert.ok(!corps.includes("SECRET"), chemin);
    }
  } finally {
    serveur.close();
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});
