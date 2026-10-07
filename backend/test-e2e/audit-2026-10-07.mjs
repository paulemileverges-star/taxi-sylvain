#!/usr/bin/env node
// Audit du développeur senior du 7 octobre 2026 : chaque défaut corrigé est rejoué sur une base
// PostgreSQL JETABLE et un vrai serveur local, avec de vraies connexions temps réel (Socket.io).
// Aucune donnée de production, aucun fournisseur réel : courriels, textos, appels, Google et
// notifications sont neutralisés, et tout appel réseau vers l'extérieur est bloqué. Depuis backend/ :
//   node test-e2e/audit-2026-10-07.mjs
// Prérequis : PostgreSQL installé localement (PG_BIN, par défaut C:/Program Files/PostgreSQL/17/bin).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PG_BIN = process.env.PG_BIN || "C:/Program Files/PostgreSQL/17/bin";
const exe = (nom) => path.join(PG_BIN, process.platform === "win32" ? `${nom}.exe` : nom);
const PORT_PG = Number(process.env.PORT_PG || 55434);
const PORT_API = Number(process.env.PORT_API || 4078);
const API = `http://127.0.0.1:${PORT_API}`;
const DOSSIER = path.join(os.tmpdir(), "ts-e2e-audit-1007");
const DB_URL = process.env.E2E_DATABASE_URL || `postgresql://postgres@localhost:${PORT_PG}/ts_audit`;
const PG_LOCAL = !process.env.E2E_DATABASE_URL; // en CI, la base est fournie par le service PostgreSQL
const JWT_SECRET = "secret-du-scenario-audit-uniquement";
const VIDE = path.join(DOSSIER, "env-vide");
const ENV_NEUTRE = {
  DATABASE_URL: DB_URL, JWT_SECRET, PORT: String(PORT_API), CORS_ORIGIN: "*", DOTENV_CONFIG_PATH: VIDE,
  SAUVEGARDES_DOSSIER: path.join(DOSSIER, "sauvegardes"), NODE_ENV: "test",
  BREVO_API_KEY: "", RESEND_API_KEY: "", MAIL_FROM: "", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_PROXY_SERVICE_SID: "",
  TWILIO_CALLER_NUMBER: "", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", GOOGLE_MAPS_API_KEY: "", ALERTES_COURRIEL: "",
  SAUVEGARDE_COURRIEL: "", SAUVEGARDE_CLE: "",
};
Object.assign(process.env, ENV_NEUTRE);

let reussis = 0;
const ok = (texte) => { reussis += 1; console.log(`OK   ${texte}`); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function lancer(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${args.join(" ")} a échoué : ${r.stderr || r.stdout}`);
  return r.stdout;
}

let serveur = null;
let journal = "";
const sockets = [];
async function nettoyer() {
  for (const s of sockets) s.close();
  if (serveur) serveur.kill();
  if (PG_LOCAL) spawnSync(exe("pg_ctl"), ["-D", path.join(DOSSIER, "pg"), "-m", "fast", "stop"], { stdio: "ignore" });
  await pause(500);
  for (let i = 0; i < 5; i++) {
    try { fs.rmSync(DOSSIER, { recursive: true, force: true }); break; } catch { await pause(500); }
  }
}

async function principal() {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });
  fs.writeFileSync(VIDE, "");
  // Le serveur local ne peut contacter que lui-même : un oubli de neutralisation échoue, il ne sort pas.
  const bloqueur = path.join(DOSSIER, "bloquer-reseau.mjs");
  fs.writeFileSync(bloqueur, `const o = globalThis.fetch;
globalThis.fetch = (...a) => { const u = new URL(typeof a[0] === "string" || a[0] instanceof URL ? a[0] : a[0].url);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) return Promise.reject(new Error("réseau extérieur bloqué (scénario)"));
  return o(...a); };\n`);
  if (PG_LOCAL) {
    lancer(exe("initdb"), ["-D", path.join(DOSSIER, "pg"), "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"]);
    const demarrage = spawnSync(exe("pg_ctl"), ["-D", path.join(DOSSIER, "pg"), "-o", `-p ${PORT_PG} -c listen_addresses=localhost`, "-l", path.join(DOSSIER, "pg.log"), "-w", "start"], { stdio: "ignore", timeout: 60000 });
    if (demarrage.status !== 0) throw new Error(`PostgreSQL n'a pas démarré (voir ${path.join(DOSSIER, "pg.log")}).`);
    lancer(exe("createdb"), ["-h", "localhost", "-p", String(PORT_PG), "-U", "postgres", "ts_audit"]);
  }
  lancer(process.execPath, [path.join(BACKEND, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], { cwd: BACKEND, env: { ...process.env } });

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  const migrations = await prisma.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL');
  assert.ok(migrations.some((m) => m.migration_name === "20261007120000_audit_7_octobre"));
  ok(`base jetable, ${migrations.length} migrations dont celle de l'audit du 7 octobre`);

  const jwt = (await import("jsonwebtoken")).default;
  const bcrypt = (await import("bcryptjs")).default;
  const { io: clientSocket } = await import("socket.io-client");
  const MOT_DE_PASSE = "Mot-de-passe-du-scenario-1";
  const hash = await bcrypt.hash(MOT_DE_PASSE, 4);
  const verifie = new Date();
  const compte = (role, nom, extra = {}) => prisma.user.create({ data: { role, name: nom, email: `${nom.toLowerCase().replace(/\s+/g, ".")}@e2e.local`, phone: "5145550100", passwordHash: hash, emailVerifiedAt: verifie, ...extra } });
  const U = {
    dispatch: await compte("DISPATCH", "Centrale"),
    sansDroit: await compte("ADMIN", "Admin Sans Droit", { permissions: [] }),
    courses: await compte("ADMIN", "Admin Courses", { permissions: ["courses"] }),
    clients: await compte("ADMIN", "Admin Clients", { permissions: ["clients"] }),
    groupesA: await compte("ADMIN", "Admin Groupes A", { permissions: ["groups"] }),
    groupesB: await compte("ADMIN", "Admin Groupes B", { permissions: ["groups"] }),
    chauffeurA: await compte("DRIVER", "Chauffeur A", { phone: "5145550001", carModel: "Toyota Camry", plate: "AAA 111" }),
    chauffeurB: await compte("DRIVER", "Chauffeur B", { phone: "5145550002" }),
    clientA: await compte("CLIENT", "Client A", { phone: "5145550003" }),
    clientB: await compte("CLIENT", "Client B", { phone: "5145550004" }),
  };
  const jeton = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name, permissions: u.permissions || [] }, JWT_SECRET);
  const J = Object.fromEntries(Object.entries(U).map(([k, u]) => [k, jeton(u)]));

  serveur = spawn(process.execPath, ["--import", pathToFileURL(bloqueur).href, "src/index.js"], { cwd: BACKEND, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
  serveur.stdout.on("data", (d) => { journal += d; });
  serveur.stderr.on("data", (d) => { journal += d; });
  let pret = false;
  for (let i = 0; i < 60 && !pret; i++) {
    try { pret = (await fetch(`${API}/health`)).ok; } catch { await pause(500); }
  }
  if (!pret) throw new Error("Le serveur local n'a pas démarré.");
  for (let i = 0; i < 24; i++) {
    if (await prisma.destination.count({ where: { code: "YUL" } })) break;
    await pause(500);
  }
  assert.ok(await prisma.destination.count({ where: { code: "YUL" } }), "catalogue YUL créé au démarrage");

  const api = async (qui, methode, url, corps, entetes = {}) => {
    const r = await fetch(`${API}/api${url}`, {
      method: methode,
      headers: { "Content-Type": "application/json", ...(qui ? { Authorization: `Bearer ${J[qui] || qui}` } : {}), ...entetes },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    const texte = await r.text();
    let data = null;
    try { data = JSON.parse(texte); } catch { data = texte; }
    return { status: r.status, data, entetes: r.headers };
  };
  const connecter = (token) => new Promise((resolve, reject) => {
    const s = clientSocket(API, { auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
    sockets.push(s);
    const recus = [];
    s.onAny((evenement, donnees) => recus.push({ evenement, donnees }));
    const delai = setTimeout(() => reject(new Error("connexion temps réel trop longue")), 5000);
    s.on("connect", () => { clearTimeout(delai); resolve({ s, recus, a: (e) => recus.filter((x) => x.evenement === e) }); });
    s.on("connect_error", (e) => { clearTimeout(delai); reject(e); });
  });
  const course = (extra = {}) => prisma.ride.create({ data: {
    pickupAddress: "12 Rue Exemple, Longueuil, QC J4H 1C6", destAddress: "34 Rue Saint-Charles Ouest, Longueuil, QC J4H 1C6",
    clientId: U.clientA.id, driverId: U.chauffeurA.id, status: "ACCEPTED", fare: 50, scheduledFor: new Date(Date.now() + 3600000), ...extra,
  } });

  // OPS-04 ----------------------------------------------------------------------------------------
  {
    const r = await fetch(`${API}/health/ready`);
    const etat = await r.json();
    assert.equal(r.status, 200);
    assert.equal(etat.base, "ok");
    assert.equal(etat.migration, "20261007120000_audit_7_octobre");
    assert.ok(etat.version && etat.sauvegardes);
    ok(`OPS-04 : /health/ready interroge la base (migration ${etat.migration}, version ${etat.version})`);
  }

  // SEC-01 ----------------------------------------------------------------------------------------
  {
    const r = await course();
    const interne = await api("dispatch", "POST", `/messages/direct/${U.chauffeurA.id}`, { rideId: r.id, text: "NOTE INTERNE SUR LE CLIENT" });
    assert.equal(interne.status, 201);
    const chat = await api("clientA", "POST", `/messages/${r.id}`, { text: "Je serai devant la porte." });
    assert.equal(chat.status, 201);
    const filClient = await api("clientA", "GET", `/messages/${r.id}`);
    assert.deepEqual(filClient.data.map((m) => m.text), ["Je serai devant la porte."]);
    const detailClient = await api("clientA", "GET", `/rides/${r.id}`);
    assert.ok(!detailClient.data.messages.some((m) => m.id === interne.data.id));
    const filChauffeur = await api("chauffeurA", "GET", `/messages/${r.id}`);
    assert.ok(!filChauffeur.data.some((m) => m.id === interne.data.id), "le fil de course reste le fil client-chauffeur");
    const direct = await api("chauffeurA", "GET", `/messages/direct/${U.chauffeurA.id}`);
    assert.ok(direct.data.some((m) => m.id === interne.data.id), "la note reste dans le fil direct du chauffeur");
    await prisma.ride.update({ where: { id: r.id }, data: { status: "BROADCAST", driverId: null } });
    const offre = await api("chauffeurB", "GET", `/rides/${r.id}`);
    assert.equal(offre.status, 200);
    assert.deepEqual(offre.data.messages, [], "une offre ouverte ne montre aucune discussion");
    assert.equal(offre.data.refusedBy, undefined);
    ok("SEC-01 : ni le client ni un chauffeur non affecté ne lisent les notes internes rattachées à la course");
  }

  // SEC-02 ----------------------------------------------------------------------------------------
  {
    const r = await course();
    for (const [url, attendu] of [["/rides", 403], [`/rides/${r.id}`, 403], ["/suggestions?field=client&q=cl", 403], ["/drivers/locations", 403], ["/drivers/search?q=ch", 403], [`/messages/direct/${U.chauffeurA.id}`, 403], ["/clients", 403], ["/drivers", 403]]) {
      assert.equal((await api("sansDroit", "GET", url)).status, attendu, `ADMIN sans droit : ${url}`);
    }
    assert.equal((await api("courses", "GET", "/rides")).status, 200);
    const choix = await api("courses", "GET", "/drivers/choix");
    assert.equal(choix.status, 200);
    assert.ok(choix.data.length >= 2 && choix.data.every((d) => d.email === undefined && d.phone === undefined), "sélecteur sans courriel ni téléphone");
    assert.equal((await api("courses", "GET", "/drivers")).status, 403);
    assert.equal((await api("courses", "GET", "/clients")).status, 403);
    assert.equal((await api("courses", "GET", "/suggestions?field=client&q=cl")).status, 200);
    const recherche = await api("courses", "GET", "/drivers/search?q=Client");
    assert.equal(recherche.status, 200);
    assert.equal(recherche.data.users.length, 0, "Courses seule : aucun compte dans la recherche");

    const sansDroit = await connecter(J.sansDroit);
    const avecCourses = await connecter(J.courses);
    const proprietaire = await connecter(J.dispatch);
    sansDroit.s.emit("ride:watch", r.id);
    await pause(200);
    const creee = await api("dispatch", "POST", "/rides", { pickupAddress: "1 Rue Test, Longueuil, QC J4H 1C6", destAddress: "2 Rue Test, Longueuil, QC J4H 1C6", fare: 40 });
    assert.equal(creee.status, 201);
    await api("clientA", "POST", `/messages/${r.id}`, { text: "Message de course" });
    await pause(400);
    assert.equal(sansDroit.recus.length, 0, `ADMIN sans droit : aucun évènement (reçu ${sansDroit.recus.map((x) => x.evenement).join(", ")})`);
    assert.ok(avecCourses.a("ride:created").length === 1 && avecCourses.a("driver:locations").length === 1);
    assert.ok(proprietaire.a("ride:created").length === 1, "le Dispatch reçoit toujours tout, une seule fois");
    // Retrait de la permission pendant la connexion : effet immédiat.
    assert.equal((await api("dispatch", "PATCH", `/admins/${U.courses.id}/permissions`, { permissions: [] })).status, 200);
    await api("dispatch", "POST", "/rides", { pickupAddress: "3 Rue Test, Longueuil, QC J4H 1C6", destAddress: "4 Rue Test, Longueuil, QC J4H 1C6", fare: 40 });
    await pause(400);
    assert.equal(avecCourses.a("ride:created").length, 1, "plus aucun évènement de course après le retrait du droit");
    assert.equal((await api("courses", "GET", "/rides")).status, 403);
    await api("dispatch", "PATCH", `/admins/${U.courses.id}/permissions`, { permissions: ["courses"] });
    ok("SEC-02 : routes et temps réel suivent les permissions, y compris un retrait en cours de connexion");
  }

  // SEC-03 ----------------------------------------------------------------------------------------
  {
    const exterieur = await connecter(J.groupesB);
    const membre = await connecter(J.groupesA);
    const chauffeur = await connecter(J.chauffeurA);
    const groupe = await api("dispatch", "POST", "/conversations", { name: "Groupe privé", participantIds: [U.chauffeurA.id, U.groupesA.id] });
    assert.equal(groupe.status, 201);
    assert.equal((await api("chauffeurA", "POST", `/conversations/${groupe.data.id}/messages`, { text: "GROUPE PRIVE" })).status, 201);
    await pause(400);
    assert.equal(exterieur.a("message:group").length, 0, "un ADMIN extérieur au groupe ne reçoit rien");
    assert.equal(membre.a("message:group").length, 1);
    assert.equal(chauffeur.a("message:group").length, 1);
    assert.equal((await api("groupesB", "GET", `/conversations/${groupe.data.id}/messages`)).status, 403);
    ok("SEC-03 : un groupe privé n'est diffusé qu'à ses membres");
  }

  // SEC-04 ----------------------------------------------------------------------------------------
  {
    let dernier = 0;
    for (let i = 0; i < 20; i++) dernier = (await api(null, "POST", "/auth/login", { email: "client.a@e2e.local", password: "mauvais" })).status;
    assert.equal(dernier, 401);
    for (const variante of ["client.a@e2e.local", " client.a@e2e.local", "CLIENT.A@e2e.local ", "\tclient.a@E2E.local"]) {
      assert.equal((await api(null, "POST", "/auth/login", { email: variante, password: "mauvais" })).status, 429, `variante « ${variante} »`);
    }
    ok("SEC-04 : après 20 essais, espaces et majuscules ne rouvrent pas le compteur");
  }

  // SEC-05 et SEC-06 ------------------------------------------------------------------------------
  {
    const base = { pickupAddress: "1580 Avenue Bourgogne, Chambly, QC J3L 2Y7", destinationCode: "YUL" };
    const affecte = await api("clientB", "POST", "/rides", { ...base, driverId: U.chauffeurB.id });
    assert.equal(affecte.status, 201);
    assert.equal(affecte.data.status, "REQUESTED");
    assert.equal(affecte.data.driverId, null);
    const diffuse = await api("clientB", "POST", "/rides", { ...base, broadcastAll: true });
    assert.equal(diffuse.data.status, "REQUESTED");
    const inconnu = await api("clientB", "POST", "/rides", { ...base, destinationCode: "INVALID_AUDIT", destAddress: "x", fare: -100 });
    assert.equal(inconnu.status, 400);
    const yul = await api("clientB", "POST", "/rides", { ...base, fare: 1 });
    const tarif = (await api("clientB", "POST", "/pricing/quote", { pickupAddress: base.pickupAddress, destinationCode: "YUL" })).data;
    assert.ok(yul.data.fare >= 0 && yul.data.fare !== 1, "le montant envoyé par le client est ignoré");
    if (tarif?.price != null) assert.equal(yul.data.fare, tarif.price, "le tarif du catalogue s'impose");
    ok("SEC-05 / SEC-06 : un client ne s'affecte rien, ne diffuse rien et ne fixe aucun montant ; code inconnu refusé");

    const d = { pickupAddress: "1 Rue Test, Longueuil, QC J4H 1C6", destAddress: "2 Rue Test, Longueuil, QC J4H 1C6", fare: 40 };
    for (const [nom, corps] of [["montant négatif", { ...d, fare: -1 }], ["distance négative", { ...d, distanceKm: -10 }], ["date illisible", { ...d, scheduledFor: "pas une date" }], ["client qui est un chauffeur", { ...d, clientId: U.chauffeurA.id }], ["chauffeur qui est un client", { ...d, driverId: U.clientA.id }]]) {
      assert.equal((await api("dispatch", "POST", "/rides", corps)).status, 400, nom);
    }
    ok("B13 : la création refuse montant ou distance négatifs, date illisible et comptes du mauvais rôle");
  }

  // F05 -------------------------------------------------------------------------------------------
  {
    const corps = { pickupAddress: "77 Rue Doublon, Longueuil, QC J4H 1C6", destAddress: "2 Rue Test, Longueuil, QC J4H 1C6", fare: 40 };
    const [a, b] = await Promise.all([1, 2].map(() => api("dispatch", "POST", "/rides", corps, { "Idempotency-Key": "saisie-doublon-0001" })));
    assert.deepEqual([a.status, b.status].sort(), [200, 201]);
    assert.equal(a.data.id, b.data.id);
    assert.equal(await prisma.ride.count({ where: { pickupAddress: { contains: "77 Rue Doublon" } } }), 1);
    ok("F05 : deux envois simultanés d'une même saisie ne créent qu'une course");
  }

  // CONC-01 ---------------------------------------------------------------------------------------
  {
    for (let i = 0; i < 10; i++) {
      const offre = await course({ status: "BROADCAST", driverId: null });
      const [a, b] = await Promise.all([api("chauffeurA", "POST", `/rides/${offre.id}/accept`, {}), api("chauffeurB", "POST", `/rides/${offre.id}/accept`, {})]);
      assert.deepEqual([a.status, b.status].sort(), [200, 409], `tour ${i + 1}`);
      const gagnant = a.status === 200 ? U.chauffeurA.id : U.chauffeurB.id;
      assert.equal((await prisma.ride.findUnique({ where: { id: offre.id } })).driverId, gagnant);
    }
    const enAttente = await course({ status: "REQUESTED", driverId: null });
    assert.equal((await api("chauffeurA", "POST", `/rides/${enAttente.id}/accept`, {})).status, 409, "une demande non diffusée ne se prend pas");
    ok("CONC-01 : sur 10 offres disputées, un seul gagnant à chaque fois, l'autre reçoit 409");
  }

  // CONC-02 et B17 --------------------------------------------------------------------------------
  {
    const finie = await course({ status: "COMPLETED", completedAt: new Date() });
    const exterieur = await Promise.all(Array.from({ length: 3 }, () => api("clientB", "POST", `/ratings/${finie.id}`, { toUserId: U.chauffeurA.id, stars: 1 })));
    assert.ok(exterieur.every((x) => x.status === 403));
    const notes = await Promise.all(Array.from({ length: 5 }, () => api("clientA", "POST", `/ratings/${finie.id}`, { toUserId: U.chauffeurA.id, stars: 4 })));
    assert.deepEqual(notes.map((x) => x.status).sort(), [201, 409, 409, 409, 409]);
    assert.equal(await prisma.rating.count({ where: { rideId: finie.id, fromUserId: U.clientA.id } }), 1);
    assert.equal((await prisma.user.findUnique({ where: { id: U.chauffeurA.id } })).ratingAvg, 4);
    const sansNote = (await api("dispatch", "GET", "/drivers/choix")).data.find((d) => d.id === U.chauffeurB.id);
    assert.equal(sansNote.ratingAvg, null, "aucune note fictive de 5/5");
    ok("CONC-02 / B17 : une seule note sous envois simultanés, moyenne exacte, aucune note fictive");
  }

  // SEC-07 ----------------------------------------------------------------------------------------
  {
    const ancienJeton = J.clientA;
    const change = await api("clientA", "POST", "/auth/change-password", { currentPassword: MOT_DE_PASSE, newPassword: "Nouveau-mot-de-passe-2" });
    assert.equal(change.status, 200);
    assert.ok(change.data.token);
    assert.equal((await api(ancienJeton, "GET", "/auth/me")).status, 401);
    assert.equal((await api(change.data.token, "GET", "/auth/me")).status, 200);
    await assert.rejects(connecter(ancienJeton), "temps réel refusé avec l'ancien jeton");
    J.clientA = change.data.token;
    ok("SEC-07 : changer le mot de passe révoque les jetons déjà distribués (API et temps réel)");
  }

  // SEC-09 ----------------------------------------------------------------------------------------
  {
    const endpoint = "https://fcm.googleapis.com/fcm/send/abonnement-du-client-b";
    await prisma.webPushSubscription.create({ data: { userId: U.clientB.id, endpoint, p256dh: "B".repeat(87), auth: "A".repeat(22) } });
    await api("clientA", "DELETE", "/push/web/subscribe", { endpoint });
    assert.equal(await prisma.webPushSubscription.count({ where: { endpoint } }), 1, "un autre compte ne peut pas le retirer");
    await api("clientB", "DELETE", "/push/web/subscribe", { endpoint });
    assert.equal(await prisma.webPushSubscription.count({ where: { endpoint } }), 0);
    ok("SEC-09 : seul le propriétaire retire son abonnement aux notifications");
  }

  // SEC-11 ----------------------------------------------------------------------------------------
  {
    const r = await api(null, "POST", "/auth/register", { name: "X", email: "audit@Reservation.TaxiSylvain.local", phone: "5145550199", password: "Mot-de-passe-1" });
    assert.equal(r.status, 400);
    assert.equal(r.data.token, undefined);
    ok("SEC-11 : le domaine technique est refusé à l'inscription publique");
  }

  // SEC-17 et B05 ---------------------------------------------------------------------------------
  {
    assert.equal((await api("clients", "POST", "/clients", { name: "Tarif Audit", phone: "5145550188", priceYUL: 1 })).status, 403);
    const cree = await api("clients", "POST", "/clients", { name: "Sans Tarif", phone: "5145550187" });
    assert.equal(cree.status, 201);
    assert.equal(cree.data.priceYUL, null);
    const nouveau = await api("clients", "POST", `/clients/${cree.data.id}/reset-password`, {});
    assert.equal(nouveau.status, 200);
    assert.equal(nouveau.data.tempPassword.length, 12);
    assert.equal((await api("clients", "POST", `/clients/${U.chauffeurA.id}/reset-password`, {})).status, 404, "la route Clients ne touche jamais un chauffeur");
    ok("SEC-17 / B05 : la permission Clients ne fixe aucun tarif ; mot de passe temporaire réinitialisable");
  }

  // B04 -------------------------------------------------------------------------------------------
  {
    const r = await course({ scheduledFor: new Date(Date.now() + 3600000) });
    const abandon = await api("chauffeurA", "POST", `/rides/${r.id}/status`, { status: "CANCELLED" });
    assert.equal(abandon.status, 200);
    const apres = await prisma.ride.findUnique({ where: { id: r.id } });
    assert.equal(apres.status, "REQUESTED", "la course revient à affecter");
    assert.equal(apres.driverId, null);
    assert.ok(apres.refusedBy.includes(U.chauffeurA.id));
    ok("B04 : l'abandon par le chauffeur remet la course « à affecter » au lieu de l'annuler");
  }

  // B13 (cédule) ----------------------------------------------------------------------------------
  {
    assert.equal((await api("dispatch", "POST", "/schedule", { driverId: U.chauffeurA.id, label: "Jour", startsAt: "pas une date" })).status, 400);
    assert.equal((await api("dispatch", "POST", "/schedule", { driverId: U.clientA.id, label: "Jour", startsAt: new Date().toISOString() })).status, 400);
    assert.equal((await api("dispatch", "POST", "/schedule", { driverId: U.chauffeurA.id, label: "Jour", startsAt: new Date().toISOString() })).status, 201);
    ok("B13 : la cédule refuse une date illisible et un compte qui n'est pas chauffeur");
  }

  // B14 et B15 ------------------------------------------------------------------------------------
  {
    const chauffeur = await connecter(J.chauffeurA);
    const equipe = await connecter(J.dispatch);
    const r = await course();
    assert.equal((await api("dispatch", "POST", `/rides/${r.id}/broadcast`, {})).status, 200);
    await pause(300);
    assert.ok(chauffeur.a("ride:updated").some((x) => x.donnees.id === r.id && x.donnees.status === "BROADCAST"), "l'ancien chauffeur est prévenu");
    const r2 = await course();
    assert.equal((await api("dispatch", "DELETE", `/rides/${r2.id}`)).status, 204);
    await pause(300);
    assert.ok(equipe.a("ride:deleted").some((x) => x.donnees.id === r2.id), "la console retire la course supprimée");
    assert.ok(chauffeur.a("ride:deleted").some((x) => x.donnees.id === r2.id), "le chauffeur aussi");
    assert.equal((await api("dispatch", "DELETE", `/rides/${r2.id}`)).status, 404);
    ok("B14 / B15 : rediffusion et suppression préviennent tous les écrans ouverts");
  }

  // B21 -------------------------------------------------------------------------------------------
  {
    await prisma.user.update({ where: { id: U.clientB.id }, data: { deletionRequestedAt: new Date(), deletionRequestVia: "app" } });
    await course({ clientId: U.clientB.id, status: "ACCEPTED" });
    const client = await connecter(J.clientB);
    const r = await api("dispatch", "POST", `/admins/deletion-requests/${U.clientB.id}/approve`, {});
    assert.equal(r.status, 409);
    await pause(300);
    assert.equal(client.a("account:deletion-decided").length, 0, "aucun « compte supprimé » sur un refus");
    assert.ok(await prisma.user.findUnique({ where: { id: U.clientB.id } }));
    ok("B21 : une suppression refusée n'annonce plus « compte supprimé » à l'application");
  }

  // SEC-13 ----------------------------------------------------------------------------------------
  {
    const form = new FormData();
    form.append("photo", new Blob([Buffer.from("<html><script>alert(1)</script></html>")], { type: "image/jpeg" }), "photo.jpg");
    const r = await fetch(`${API}/api/drivers/${U.chauffeurA.id}/photos`, { method: "POST", headers: { Authorization: `Bearer ${J.chauffeurA}` }, body: form });
    assert.equal(r.status, 400);
    const uploads = path.join(BACKEND, "uploads");
    const restes = fs.existsSync(uploads) ? fs.readdirSync(uploads).filter((f) => f.startsWith(`${U.chauffeurA.id}-`)) : [];
    assert.deepEqual(restes, [], "le fichier refusé est effacé du disque");
    ok("SEC-13 : un fichier qui n'est pas une vraie image est refusé et effacé");
  }

  // SEC-19 ----------------------------------------------------------------------------------------
  {
    const lien = await api("chauffeurA", "POST", "/reports/export-link", {});
    assert.equal(lien.status, 200);
    const pdf = await fetch(`${API}/api/reports/export?jeton=${encodeURIComponent(lien.data.jeton)}`);
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get("content-type"), /pdf/);
    assert.equal(pdf.headers.get("cache-control"), "no-store");
    await pdf.arrayBuffer();
    assert.equal((await api(lien.data.jeton, "GET", "/rides")).status, 401, "le jeton d'export n'ouvre rien d'autre");
    ok("SEC-19 : export par lien de 5 minutes, sans jeton de session dans l'adresse");
  }

  // SEC-14 ----------------------------------------------------------------------------------------
  {
    const r = await course({ status: "STARTED" });
    const statuts = [];
    for (let i = 0; i < 31; i++) statuts.push((await api("clientA", "POST", `/messages/${r.id}`, { text: `message ${i}` })).status);
    assert.equal(statuts.at(-1), 429);
    assert.ok(statuts.slice(0, 20).every((s) => s === 201));
    ok("SEC-14 : au-delà de 30 messages par minute, la réponse est 429");
  }

  // SEC-15 ----------------------------------------------------------------------------------------
  {
    const { lireBase, verifierRelations } = await import(pathToFileURL(path.join(BACKEND, "src/lib/sauvegarde.js")).href);
    for (let tour = 0; tour < 5; tour++) {
      const victimes = [];
      for (let i = 0; i < 6; i++) {
        const c = await prisma.user.create({ data: { role: "CLIENT", name: `Éphémère ${tour}-${i}`, email: `eph-${tour}-${i}@e2e.local`, phone: "1", passwordHash: "x" } });
        await prisma.ride.create({ data: { pickupAddress: "a", destAddress: "b", fare: 1, clientId: c.id, status: "REQUESTED" } });
        victimes.push(c.id);
      }
      // Suppressions pendant la lecture de la base : une course puis son client, l'un après l'autre.
      const effacer = (async () => {
        for (const id of victimes) {
          await prisma.ride.deleteMany({ where: { clientId: id } });
          await prisma.user.delete({ where: { id } });
          await pause(5);
        }
      })();
      const contenu = await lireBase(prisma);
      await effacer;
      assert.deepEqual(verifierRelations(contenu), [], `photographie cohérente (tour ${tour + 1})`);
    }
    ok("SEC-15 : sauvegarde sous suppressions simultanées : une seule photographie cohérente, liens vérifiés");
  }

  // B16 -------------------------------------------------------------------------------------------
  {
    const { sendRideReminders } = await import(pathToFileURL(path.join(BACKEND, "src/jobs/rideReminders.js")).href);
    const { generateWeeklyReports } = await import(pathToFileURL(path.join(BACKEND, "src/jobs/weeklyReport.js")).href);
    await prisma.user.update({ where: { id: U.chauffeurB.id }, data: { pushToken: "ExponentPushToken[scenario]", reminderOffsets: [60] } });
    const heure = new Date(Date.now() + 10 * 86400000); // hors de la fenêtre du serveur : seul ce test la voit
    const r = await course({ driverId: U.chauffeurB.id, clientId: null, scheduledFor: heure });
    const echeance = new Date(heure.getTime() - 60 * 60000 + 1000);
    const vrai = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("panne du service de notification (simulée)"); };
    await sendRideReminders(null, echeance);
    const marque = () => prisma.sentReminder.count({ where: { rideId: r.id, userId: U.chauffeurB.id, offsetMinutes: 60, canal: "push" } });
    assert.equal(await marque(), 0, "panne : le rappel n'est pas noté envoyé, il sera retenté");
    globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    await sendRideReminders(null, new Date(echeance.getTime() + 60000));
    assert.equal(await marque(), 1, "retenté la minute suivante, puis noté");

    const debut = new Date(Date.now() - 21 * 86400000);
    const { semaineDe } = await import(pathToFileURL(path.join(BACKEND, "src/lib/semaines.js")).href);
    const semaine = semaineDe(debut);
    await course({ driverId: U.chauffeurB.id, clientId: null, status: "COMPLETED", completedAt: debut, scheduledFor: new Date(semaine.weekStart.getTime() + 36 * 3600000) });
    globalThis.fetch = async () => { throw new Error("panne simulée"); };
    await generateWeeklyReports(null, semaine, { courriel: true, synthese: "jamais" });
    const recap = () => prisma.weeklyReport.findFirst({ where: { driverId: U.chauffeurB.id, weekStart: semaine.weekStart } });
    assert.equal((await recap()).notifiedAt, null, "panne : le récap reste à envoyer");
    globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    await generateWeeklyReports(null, semaine, { courriel: true, synthese: "jamais" });
    assert.ok((await recap()).notifiedAt, "relance : récap envoyé puis noté");
    globalThis.fetch = vrai;
    ok("B16 : un rappel ou un récap perdu dans une panne est retenté au lieu d'être noté envoyé");
  }

  await prisma.$disconnect();
  console.log(`\n${reussis} vérifications réussies.`);
}

principal()
  .then(async () => { await nettoyer(); process.exit(0); })
  .catch(async (e) => {
    console.error("ÉCHEC :", e.stack || e.message);
    console.error("--- journal du serveur ---\n" + journal.slice(-4000));
    await nettoyer();
    process.exit(1);
  });
