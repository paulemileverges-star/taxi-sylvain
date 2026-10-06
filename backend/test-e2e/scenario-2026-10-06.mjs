#!/usr/bin/env node
// Scénario de bout en bout de la vague du 6 octobre 2026, sur une base PostgreSQL JETABLE et un
// vrai serveur local (aucune donnée de production, aucun fournisseur réel : courriels, textos,
// appels, Google et notifications web sont neutralisés). À lancer depuis backend/ :
//   node test-e2e/scenario-2026-10-06.mjs
// Prérequis : PostgreSQL installé localement (PG_BIN, par défaut C:/Program Files/PostgreSQL/17/bin).
// Couvre : fiche chauffeur modifiable, arrêts, adresses YUL (Arrivées et P4) et tarif du P4,
// délais de 2 h (contact) et 3 h (départ), rapports par date de course, exports, récap notifié une
// seule fois, régénération manuelle silencieuse.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PG_BIN = process.env.PG_BIN || "C:/Program Files/PostgreSQL/17/bin";
const exe = (nom) => path.join(PG_BIN, process.platform === "win32" ? `${nom}.exe` : nom);
const PORT_PG = 55433;
const PORT_API = 4077;
const DOSSIER = path.join(os.tmpdir(), "ts-e2e-1006");
const DB_URL = `postgresql://postgres@localhost:${PORT_PG}/ts_e2e`;
const JWT_SECRET = "secret-du-scenario-uniquement";
const VIDE = path.join(DOSSIER, "env-vide");
// Toutes les clés de fournisseurs forcées à vide : le serveur local ne peut rien envoyer à personne.
const ENV_NEUTRE = {
  DATABASE_URL: DB_URL, JWT_SECRET, PORT: String(PORT_API), CORS_ORIGIN: "*", DOTENV_CONFIG_PATH: VIDE,
  SAUVEGARDES_DOSSIER: path.join(DOSSIER, "sauvegardes"),
  BREVO_API_KEY: "", RESEND_API_KEY: "", MAIL_FROM: "", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_PROXY_SERVICE_SID: "",
  TWILIO_CALLER_NUMBER: "", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", GOOGLE_MAPS_API_KEY: "", ALERTES_COURRIEL: "",
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
async function nettoyer() {
  if (serveur) serveur.kill();
  spawnSync(exe("pg_ctl"), ["-D", path.join(DOSSIER, "pg"), "-m", "fast", "stop"], { stdio: "ignore" });
  await pause(500);
  fs.rmSync(DOSSIER, { recursive: true, force: true });
}

async function principal() {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });
  fs.writeFileSync(VIDE, "");
  lancer(exe("initdb"), ["-D", path.join(DOSSIER, "pg"), "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"]);
  // Sorties ignorées : le serveur PostgreSQL lancé en arrière-plan hériterait sinon des canaux de
  // sortie, et Node attendrait leur fermeture indéfiniment.
  const demarrage = spawnSync(exe("pg_ctl"), ["-D", path.join(DOSSIER, "pg"), "-o", `-p ${PORT_PG} -c listen_addresses=localhost`, "-l", path.join(DOSSIER, "pg.log"), "-w", "start"], { stdio: "ignore", timeout: 60000 });
  if (demarrage.status !== 0) throw new Error(`PostgreSQL n'a pas démarré (voir ${path.join(DOSSIER, "pg.log")}).`);
  lancer(exe("createdb"), ["-h", "localhost", "-p", String(PORT_PG), "-U", "postgres", "ts_e2e"]);
  lancer(process.execPath, [path.join(BACKEND, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], { cwd: BACKEND, env: { ...process.env } });
  ok("base jetable créée, 23 migrations appliquées (dont celle du 6 octobre)");

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  const jwt = (await import("jsonwebtoken")).default;

  // État de la production avant la vague : YUL au centre des pistes, sans P4.
  await prisma.destination.create({ data: { code: "YUL", label: "Aéroport Montréal-Trudeau (YUL)", address: "975 Boul. Roméo-Vachon N, Dorval, QC H4Y 1H1", lat: 45.4706, lng: -73.7408, sortOrder: 1 } });
  const verifie = new Date();
  const dispatch = await prisma.user.create({ data: { role: "DISPATCH", name: "Centrale", email: "dispatch@e2e.local", phone: "4384991120", passwordHash: "x", emailVerifiedAt: verifie } });
  const chauffeur = await prisma.user.create({ data: { role: "DRIVER", name: "Yves Test", email: "yves@e2e.local", phone: "5145550001", passwordHash: "x", carModel: "Toyota Camry", plate: "ABC 123", emailVerifiedAt: verifie } });
  const client = await prisma.user.create({ data: { role: "CLIENT", name: "Client Test", email: "client@e2e.local", phone: "5145550002", passwordHash: "x", emailVerifiedAt: verifie } });
  const jeton = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name, permissions: u.permissions || [] }, JWT_SECRET);
  const J = { dispatch: jeton(dispatch), chauffeur: jeton(chauffeur), client: jeton(client) };

  serveur = spawn(process.execPath, ["src/index.js"], { cwd: BACKEND, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
  let journal = "";
  serveur.stdout.on("data", (d) => { journal += d; });
  serveur.stderr.on("data", (d) => { journal += d; });
  const API = `http://localhost:${PORT_API}`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* pas encore prêt */ }
    await pause(500);
  }
  const appel = async (qui, methode, chemin, corps) => {
    const r = await fetch(`${API}/api${chemin}`, { method: methode, headers: { "Content-Type": "application/json", Authorization: `Bearer ${J[qui]}` }, body: corps ? JSON.stringify(corps) : undefined });
    const type = r.headers.get("content-type") || "";
    return { status: r.status, type, data: type.includes("json") ? await r.json() : await r.arrayBuffer() };
  };
  // Les destinations par défaut sont posées au démarrage, de façon asynchrone.
  for (let i = 0; i < 20 && (await prisma.destination.count()) < 4; i++) await pause(300);
  assert.match(journal, /Taxi Sylvain API en écoute/);
  assert.match(journal, /Courriels : non configurés/);
  ok("serveur local démarré sans aucun fournisseur réel");

  // 1. Catalogue : YUL devient « Arrivées » au bon point, le P4 apparaît, même tarif YUL.
  const dests = (await appel("dispatch", "GET", "/destinations")).data;
  const yul = dests.find((d) => d.code === "YUL");
  const p4 = dests.find((d) => d.code === "YULP4");
  assert.match(yul.address, /Arrivées/);
  assert.notEqual(yul.lat, 45.4706);
  assert.equal(yul.pointVerified, true);
  assert.match(p4.address, /590 Boulevard Albert-De Niverville/);
  assert.deepEqual(dests.map((d) => d.code), ["YUL", "YULP4", "YHU", "REM"]);
  assert.equal(dests.find((d) => d.code === "YHU").pointVerified, false);
  ok("catalogue : YUL Arrivées (ancien point remplacé), P4 ajouté, YHU signalé non vérifié, ordre des boutons");

  const recherche = (await appel("dispatch", "GET", `/geocode/search?q=${encodeURIComponent("aéroport YUL")}`)).data;
  assert.deepEqual(recherche.map((s) => s.catalogue), ["YUL", "YULP4"]);
  ok("recherche « aéroport YUL » : seulement les Arrivées et le P4");

  // 2. Fiche chauffeur modifiable.
  const modif = await appel("dispatch", "PATCH", `/drivers/${chauffeur.id}`, { name: "Yves Christopher", carModel: "Toyota RAV4 2025", carColor: "Blanc", plate: "xyz 789" });
  assert.equal(modif.status, 200);
  const liste = (await appel("dispatch", "GET", "/drivers")).data;
  const fiche = liste.find((d) => d.id === chauffeur.id);
  assert.deepEqual([fiche.name, fiche.carModel, fiche.carColor, fiche.plate], ["Yves Christopher", "Toyota RAV4 2025", "Blanc", "XYZ 789"]);
  assert.equal((await appel("chauffeur", "PATCH", `/drivers/${chauffeur.id}`, { carColor: "Rouge" })).status, 403);
  ok("fiche chauffeur : nom, véhicule, couleur, plaque modifiés par le Dispatch ; refusé au chauffeur lui-même");

  // 3. Course avec arrêt vers le P4, tarif YUL de la grille.
  const chambly = await prisma.priceZone.findFirst({ where: { name: "Chambly" } });
  const dans = (heures) => new Date(Date.now() + heures * 3600000).toISOString();
  const nouvelle = async (heures, extra = {}) => (await appel("dispatch", "POST", "/rides", {
    pickupAddress: "1580 Avenue Bourgogne, Chambly, QC J3L 2Y7", pickupLat: 45.4485, pickupLng: -73.2876, pickupConfidence: "porte",
    destinationCode: "YULP4", scheduledFor: dans(heures), driverId: chauffeur.id, clientId: client.id, distanceKm: 40,
    stops: [{ address: "34 Rue Saint-Charles Ouest, Longueuil, QC J4H 1C6", lat: 45.5368, lng: -73.5146, confidence: "porte" }],
    ...extra,
  }));
  const c5h = await nouvelle(5);
  assert.equal(c5h.status, 201, JSON.stringify(c5h.data));
  assert.equal(c5h.data.stops.length, 1);
  assert.equal(c5h.data.destConfidence, "verifie");
  assert.match(c5h.data.destAddress, /Albert-De Niverville/);
  if (chambly?.priceYUL) assert.equal(c5h.data.fare, chambly.priceYUL);
  ok(`course créée avec un arrêt vers le P4, tarif YUL de la grille (${c5h.data.fare} $)`);

  // 4. Départ : refusé à 5 h, permis à 2 h 30.
  const tot = await appel("chauffeur", "POST", `/rides/${c5h.data.id}/status`, { status: "EN_ROUTE" });
  assert.equal(tot.status, 409);
  assert.match(tot.data.error, /Trop tôt.*3 heures/);
  const c2h30 = (await nouvelle(2.5)).data;
  const c1h30 = (await nouvelle(1.5)).data;
  // 5. Contact : refusé à 2 h 30 (message et appel), permis à 1 h 30.
  const msgTot = await appel("chauffeur", "POST", `/messages/${c2h30.id}`, { text: "Bonjour" });
  assert.equal(msgTot.status, 403);
  assert.match(msgTot.data.error, /2 heures/);
  const appelTot = await appel("chauffeur", "POST", `/rides/${c2h30.id}/call`);
  assert.equal(appelTot.status, 403);
  assert.match(appelTot.data.error, /2 heures/);
  assert.equal((await appel("client", "POST", `/messages/${c2h30.id}`, { text: "Le client écrit quand il veut" })).status, 201);
  assert.equal((await appel("chauffeur", "POST", `/messages/${c1h30.id}`, { text: "J'arrive" })).status, 201);
  assert.equal((await appel("chauffeur", "POST", `/rides/${c1h30.id}/call`)).status, 503, "délai passé : seul Twilio (non configuré ici) répond");
  const enRoute = await appel("chauffeur", "POST", `/rides/${c2h30.id}/status`, { status: "EN_ROUTE" });
  assert.equal(enRoute.status, 200);
  ok("délais : départ refusé à 5 h et permis à 2 h 30 ; message et appel refusés à 2 h 30, permis à 1 h 30 ; le client écrit librement");

  // 6. Arrêts modifiés depuis la console.
  const deuxArrets = await appel("dispatch", "PATCH", `/rides/${c5h.data.id}`, { stops: [
    { address: "34 Rue Saint-Charles Ouest, Longueuil, QC J4H 1C6", lat: 45.5368, lng: -73.5146, confidence: "porte" },
    { address: "100 Boulevard de Mortagne, Boucherville, QC J4B 5K6", lat: 45.5933, lng: -73.4446, confidence: "porte" },
  ] });
  assert.equal(deuxArrets.status, 200);
  assert.equal(deuxArrets.data.stops.length, 2);
  assert.equal((await appel("dispatch", "PATCH", `/rides/${c5h.data.id}`, { stops: Array.from({ length: 6 }, (_, i) => ({ address: `${i} Rue X, Chambly` })) })).status, 400);
  ok("arrêts : deux arrêts enregistrés par la console, six refusés");

  // 7. Rapports par date de course : une course de la semaine dernière terminée cette semaine.
  const { semaineDe, decalerSemaine } = await import("../src/lib/semaines.js");
  const cetteSemaine = semaineDe(new Date());
  const passee = semaineDe(decalerSemaine(cetteSemaine.weekStart, -1));
  const dimancheSoir = new Date(cetteSemaine.weekStart.getTime() - 90 * 60000); // dimanche 22 h 30
  const base = { pickupAddress: "12 Rue Principale, Varennes, QC J3X 1A1", destAddress: "YUL", driverId: chauffeur.id, clientId: client.id, royaltyRate: 0.1 };
  await prisma.ride.create({ data: { ...base, status: "COMPLETED", scheduledFor: dimancheSoir, completedAt: new Date(cetteSemaine.weekStart.getTime() + 40 * 60000), fare: 95 } });
  await prisma.ride.create({ data: { ...base, status: "COMPLETED", scheduledFor: new Date(passee.weekStart.getTime() + 30 * 3600000), completedAt: new Date(passee.weekStart.getTime() + 31 * 3600000), fare: 90 } });
  await prisma.ride.create({ data: { ...base, status: "CANCELLED", scheduledFor: new Date(passee.weekStart.getTime() + 50 * 3600000), fare: 80 } });
  const qs = `from=${passee.weekStart.toISOString()}&to=${passee.weekEnd.toISOString()}`;
  const rapport = (await appel("dispatch", "GET", `/reports/periode?${qs}`)).data;
  const bloc = rapport.chauffeurs.find((b) => b.chauffeur.id === chauffeur.id);
  assert.equal(bloc.effectuees.nombre, 2, "la course du dimanche 22 h 30 terminée le lundi reste dans sa semaine");
  assert.equal(bloc.effectuees.montant, 185);
  assert.equal(bloc.effectuees.redevance, 18.5);
  assert.equal(rapport.annulees, 1);
  const enCours = (await appel("dispatch", "GET", "/reports/periode")).data;
  assert.ok(enCours.chauffeurs.find((b) => b.chauffeur.id === chauffeur.id).aEffectuer.nombre >= 3, "les courses à effectuer de la semaine sont listées");
  const mesRapports = (await appel("chauffeur", "GET", "/reports/mine")).data;
  assert.equal(mesRapports[0].rideCount, 2);
  assert.equal(mesRapports[0].totalFare, 185);
  assert.equal(new Date(mesRapports[0].weekStart).toISOString(), passee.weekStart.toISOString());
  const pdf = await appel("chauffeur", "GET", `/reports/export?format=pdf&${qs}`);
  const xlsx = await appel("dispatch", "GET", `/reports/export?format=xlsx&${qs}`);
  assert.equal(pdf.status, 200);
  assert.match(pdf.type, /pdf/);
  assert.equal(xlsx.status, 200);
  ok("rapports : par date de course (2 effectuées, 185 $, 18,50 $), annulée exclue, à effectuer listées, « Mes rapports » et exports cohérents");

  // 8. Récap : une seule notification par semaine ; la régénération manuelle est silencieuse.
  const { generateWeeklyReports } = await import("../src/jobs/weeklyReport.js");
  const emis = [];
  const fauxIo = { to: (salle) => ({ emit: (evenement) => emis.push(`${salle}:${evenement}`) }) };
  await generateWeeklyReports(fauxIo, passee, { courriel: true });
  await generateWeeklyReports(fauxIo, passee, { courriel: true });
  const manuel = await appel("dispatch", "POST", "/reports/generate", { from: passee.weekStart.toISOString(), to: passee.weekEnd.toISOString() });
  assert.equal(manuel.status, 201);
  assert.equal(emis.filter((e) => e.endsWith("report:ready")).length, 1, `notifications : ${emis.join(", ")}`);
  const fige = await prisma.weeklyReport.findFirst({ where: { driverId: chauffeur.id, weekStart: passee.weekStart } });
  assert.ok(fige.notifiedAt);
  assert.equal(fige.rideCount, 2);
  ok("récap : notifié une seule fois malgré deux générations automatiques et une manuelle");

  await prisma.$disconnect();
  console.log(`\n${reussis} vérifications réussies.`);
}

try {
  await principal();
} catch (e) {
  console.error("\nÉCHEC :", e.message);
  process.exitCode = 1;
} finally {
  await nettoyer();
}
