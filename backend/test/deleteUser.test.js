// Suppression de compte : ce que la relecture du 19 septembre 2026 a trouvé non testé. Tout se
// joue sur une fausse base en mémoire ; aucune base réelle n'est touchée.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
const { deleteUserCascade, removeUserUploads } = await import("../src/lib/deleteUser.js");

// Fausse base : juste ce que deleteUserCascade utilise, avec une vraie annulation en cas d'erreur.
function fakeDb({ users = [], rides = [] }) {
  const state = { users: structuredClone(users), rides: structuredClone(rides) };
  const journal = [];
  const matches = (row, where = {}) =>
    Object.entries(where).every(([key, cond]) => {
      if (key === "OR") return cond.some((w) => matches(row, w));
      if (cond && typeof cond === "object" && Array.isArray(cond.in)) return cond.in.includes(row[key]);
      return row[key] === cond;
    });
  const noop = (nom) => ({ deleteMany: async (a) => { journal.push(`${nom}.deleteMany`); return { count: 0 }; } });
  const tx = {
    ride: {
      findFirst: async ({ where }) => state.rides.find((r) => matches(r, where)) || null,
      findMany: async ({ where }) => state.rides.filter((r) => matches(r, where)).map((r) => ({ ...r })),
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const r of state.rides) if (matches(r, where)) { Object.assign(r, data); count += 1; }
        return { count };
      },
    },
    conversation: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    groupMessage: noop("groupMessage"),
    conversationParticipant: noop("conversationParticipant"),
    message: noop("message"),
    rating: noop("rating"),
    schedule: noop("schedule"),
    weeklyReport: noop("weeklyReport"),
    user: {
      delete: async ({ where }) => {
        journal.push("user.delete");
        state.users = state.users.filter((u) => u.id !== where.id);
      },
    },
  };
  const db = {
    user: { findUnique: async ({ where }) => state.users.find((u) => u.id === where.id) || null },
    $transaction: async (fn) => {
      const copie = structuredClone(state);
      try {
        const out = await fn(tx);
        journal.push("transaction.ok");
        return out;
      } catch (e) {
        Object.assign(state, copie);
        journal.push("transaction.annulee");
        throw e;
      }
    },
  };
  return { db, state, journal };
}

const photos = (journal) => async (id) => { journal.push(`photos:${id}`); return 0; };
const ride = (id, status, extra = {}) => ({ id, status, clientId: null, driverId: null, ...extra });

test("le compte Dispatch ne peut jamais être supprimé, par aucune route", async () => {
  const { db, state } = fakeDb({ users: [{ id: "disp1", role: "DISPATCH" }] });
  await assert.rejects(deleteUserCascade("disp1", { db, removeFiles: async () => 0 }), (e) => e.code === "COMPTE_PROTEGE");
  assert.equal(state.users.length, 1);
});

test("un compte introuvable donne une erreur claire", async () => {
  const { db } = fakeDb({});
  await assert.rejects(deleteUserCascade("absent1", { db, removeFiles: async () => 0 }), (e) => e.code === "COMPTE_INTROUVABLE");
});

test("les courses à venir d'un client supprimé sont annulées, l'historique est gardé sans lien", async () => {
  const { db, state, journal } = fakeDb({
    users: [{ id: "cli1", role: "CLIENT" }],
    rides: [
      ride("r1", "REQUESTED", { clientId: "cli1" }),
      ride("r2", "BROADCAST", { clientId: "cli1" }),
      ride("r3", "COMPLETED", { clientId: "cli1", driverId: "drv9" }),
      ride("r4", "REQUESTED", { clientId: "autre" }),
    ],
  });
  const result = await deleteUserCascade("cli1", { db, removeFiles: photos(journal) });

  const byId = Object.fromEntries(state.rides.map((r) => [r.id, r]));
  assert.equal(byId.r1.status, "CANCELLED");
  assert.equal(byId.r2.status, "CANCELLED", "une course diffusée ne doit plus être proposée aux chauffeurs");
  assert.equal(byId.r3.status, "COMPLETED", "une course terminée reste dans l'historique");
  assert.equal(byId.r3.driverId, "drv9");
  for (const id of ["r1", "r2", "r3"]) assert.equal(byId[id].clientId, null);
  assert.equal(byId.r4.status, "REQUESTED", "les courses des autres clients ne bougent pas");
  assert.deepEqual(result.annulees.map((r) => r.id).sort(), ["r1", "r2"]);
  assert.equal(state.users.length, 0);
});

test("les courses confiées à un chauffeur supprimé repartent en attente d'affectation", async () => {
  const { db, state, journal } = fakeDb({
    users: [{ id: "drv1", role: "DRIVER" }],
    rides: [ride("a1", "ACCEPTED", { driverId: "drv1", clientId: "c1" }), ride("a2", "COMPLETED", { driverId: "drv1", clientId: "c1" })],
  });
  const result = await deleteUserCascade("drv1", { db, removeFiles: photos(journal) });
  const byId = Object.fromEntries(state.rides.map((r) => [r.id, r]));
  assert.equal(byId.a1.status, "REQUESTED");
  assert.equal(byId.a1.driverId, null);
  assert.equal(byId.a1.clientId, "c1", "le client garde sa course");
  assert.equal(byId.a2.status, "COMPLETED");
  assert.deepEqual(result.aReaffecter.map((r) => r.id), ["a1"]);
});

test("une course en cours bloque la suppression, et rien n'est effacé", async () => {
  const { db, state, journal } = fakeDb({
    users: [{ id: "cli2", role: "CLIENT" }],
    rides: [ride("e1", "EN_ROUTE", { clientId: "cli2", driverId: "d1" }), ride("e2", "REQUESTED", { clientId: "cli2" })],
  });
  await assert.rejects(
    deleteUserCascade("cli2", { db, removeFiles: photos(journal), refuseIfActive: true }),
    (e) => e.code === "COURSE_EN_COURS" && e.status === 409
  );
  assert.equal(state.users.length, 1, "le compte existe toujours");
  assert.equal(state.rides.find((r) => r.id === "e2").status, "REQUESTED", "aucune course n'a été annulée");
  assert.ok(!journal.some((l) => l.startsWith("photos:")), "aucune photo effacée");
});

test("les photos sont effacées seulement après la réussite de la transaction", async () => {
  const { db, journal } = fakeDb({ users: [{ id: "drv2", role: "DRIVER" }] });
  await deleteUserCascade("drv2", { db, removeFiles: photos(journal) });
  assert.ok(journal.indexOf("photos:drv2") > journal.indexOf("transaction.ok"));
});

test("seules les photos du compte supprimé sont effacées du disque", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "photos-"));
  for (const f of ["cmabc123xyz-photo-1.jpg", "cmabc123xyz-carPhoto-2.png", "cmautre999-photo-3.jpg"]) {
    await fs.writeFile(path.join(dir, f), "x");
  }
  assert.equal(await removeUserUploads("cmabc123xyz", dir), 2);
  assert.deepEqual(await fs.readdir(dir), ["cmautre999-photo-3.jpg"]);
  assert.equal(await removeUserUploads("../..", dir), 0, "un identifiant suspect n'efface rien");
  assert.equal(await removeUserUploads("", dir), 0);
  await fs.rm(dir, { recursive: true, force: true });
});

// Décision du propriétaire du 19 septembre 2026 : un chauffeur supprime son compte lui-même,
// automatiquement, sans aucune vérification (ni redevance, ni course en cours).
const { courseEnCoursBloque } = await import("../src/lib/accountDeletion.js");
const { announceDeletion, envoyerAnnulationsAgenda } = await import("../src/lib/deleteUser.js");

test("un chauffeur qui supprime son compte n'est jamais bloqué : ses courses repartent chez le Dispatch", async () => {
  const { db, state } = fakeDb({
    users: [{ id: "drv3", role: "DRIVER" }],
    rides: [
      ride("s1", "STARTED", { driverId: "drv3", clientId: "c1" }),
      ride("s2", "EN_ROUTE", { driverId: "drv3", clientId: "c2" }),
      ride("s3", "ACCEPTED", { driverId: "drv3", clientId: "c3" }),
    ],
  });
  const result = await deleteUserCascade("drv3", { db, removeFiles: async () => 0, refuseIfActive: courseEnCoursBloque("DRIVER") });
  assert.equal(state.users.length, 0, "le compte est supprimé");
  for (const r of state.rides) {
    assert.equal(r.status, "REQUESTED", `${r.id} doit repartir en attente d'un chauffeur`);
    assert.equal(r.driverId, null);
  }
  assert.deepEqual(result.aReaffecter.map((r) => r.id).sort(), ["s1", "s2", "s3"]);
});

test("un client avec une course en cours reste bloqué, lui", async () => {
  const { db, state } = fakeDb({
    users: [{ id: "cli3", role: "CLIENT" }],
    rides: [ride("t1", "ACCEPTED", { clientId: "cli3", driverId: "d1" })],
  });
  await assert.rejects(
    deleteUserCascade("cli3", { db, removeFiles: async () => 0, refuseIfActive: courseEnCoursBloque("CLIENT") }),
    (e) => e.code === "COURSE_EN_COURS"
  );
  assert.equal(state.users.length, 1);
});

test("les courses retirées ou annulées par une suppression sortent de l'agenda de leur chauffeur", () => {
  const envois = [];
  const send = (course, personnes) => envois.push({ id: course.id, personnes });
  const chauffeur = { id: "d1", name: "Chauffeur", email: "chauffeur@exemple.ca" };
  envoyerAnnulationsAgenda(
    {
      annulees: [{ id: "x1", driver: chauffeur }, { id: "x2", driver: null }],
      aReaffecter: [{ id: "y1", driver: chauffeur }],
    },
    { send }
  );
  assert.deepEqual(envois.map((e) => e.id), ["x1", "y1"], "une course sans chauffeur n'envoie rien");
  for (const e of envois) assert.deepEqual(e.personnes, [{ person: chauffeur, audience: "driver" }]);
  assert.deepEqual(envoyerAnnulationsAgenda(null, { send }), []);
});

test("après la suppression d'un chauffeur, le client et le Dispatch voient la course en attente", () => {
  const emis = [];
  const salle = (room) => ({
    emit: (evenement, donnees) => emis.push({ room, evenement, donnees }),
    disconnectSockets: () => emis.push({ room, evenement: "deconnexion" }),
    socketsLeave: () => {},
  });
  const io = { to: salle, in: salle };
  announceDeletion(io, { userId: "drv4", role: "DRIVER", annulees: [], aReaffecter: [{ id: "z1", driver: null }] }, "Jean");
  const vers = (room, evenement) => emis.find((e) => e.room === room && e.evenement === evenement);
  assert.ok(vers("user:drv4", "deconnexion"), "le chauffeur supprimé est déconnecté");
  assert.equal(vers("ride:z1", "ride:status")?.donnees.status, "REQUESTED", "le client est prévenu");
  assert.equal(vers("dispatch", "ride:updated")?.donnees.status, "REQUESTED");
  assert.match(vers("dispatch", "ride:notification")?.donnees.text, /chauffeur de Jean.*1 course\(s\) à réaffecter/);
});
