// Audit du développeur senior du 7 octobre 2026 : un test par règle corrigée, nommé d'après le
// constat (SEC-xx, CONC-xx, Bxx, OPS-xx). Fonctions pures et fausses dépendances seulement : aucune
// base réelle, aucun réseau. Les mêmes règles sont rejouées sur une vraie base PostgreSQL et un vrai
// serveur par test-e2e/audit-2026-10-07.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import crypto from "node:crypto";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "secret-de-test";

const equipe = await import("../src/lib/equipe.js");
const validation = await import("../src/lib/validationCourse.js");
const { unSeulTraitement, oublierTraitements } = await import("../src/lib/idempotence.js");
const { analyserImage, verdictImage } = await import("../src/lib/images.js");
const { generateTempPassword, isPlaceholderEmail, ALPHABET_MOT_DE_PASSE } = await import("../src/lib/placeholderEmail.js");
const { messageDuCode } = await import("../src/lib/verification.js");
const { erreurCourrielInscription, cleTentatives } = await import("../src/routes/auth.js");
const { rateLimit, viderCompteurs } = await import("../src/middleware/rateLimit.js");
const { baseLocale } = await import("../src/lib/baseLocale.js");
const { parseCsv, texteDuCsv, pick, separateurDuCsv } = await import("../src/lib/bulkImport.js");
const { matchZone, estVilleDeQuebec } = await import("../src/lib/pricing.js");
const { cleanAddressText } = await import("../src/lib/addressFormat.js");
const sauvegarde = await import("../src/lib/sauvegarde.js");
const { auRythme, reinitialiserNominatim, ATTENTE_MAX, INTERVALLE_MS } = await import("../src/lib/nominatim.js");
const { getOrCreateCallSession, fermerSessionAppel } = await import("../src/lib/twilioProxy.js");
const { texteDeMessage, FIL_DE_COURSE, LONGUEUR_MAX_MESSAGE } = await import("../src/routes/messages.js");
const { PERMISSIONS_SUGGESTION } = await import("../src/routes/suggestions.js");
const { personalRoom } = await import("../src/lib/rooms.js");
const { positionValide } = await import("../src/sockets/index.js");
const { PERMISSIONS } = await import("../src/routes/admins.js");

const admin = (permissions) => ({ id: "adm", role: "ADMIN", permissions });

// --- SEC-02 / SEC-03 / F04 : droits de l'équipe ------------------------------------------------

test("SEC-02 : un ADMIN n'a que les droits choisis ; le Dispatch les a tous ; chauffeur et client aucun", () => {
  assert.equal(equipe.aPermission(admin([]), "courses"), false);
  assert.equal(equipe.aPermission(admin(["clients"]), "courses"), false);
  assert.equal(equipe.aPermission(admin(["clients"]), "courses", "clients"), true, "l'une des permissions suffit");
  assert.equal(equipe.aPermission({ role: "DISPATCH" }, "reports"), true);
  assert.equal(equipe.aPermission({ role: "DRIVER", permissions: ["courses"] }, "courses"), false, "une permission n'a de sens que pour un ADMIN");
  assert.equal(equipe.aPermission({ role: "CLIENT" }, "courses"), false);
  assert.equal(equipe.aPermission(null, "courses"), false);
});

test("SEC-02 : les salles temps réel suivent les permissions ; « dispatch » est réservée au propriétaire", () => {
  assert.deepEqual(equipe.sallesEquipe(admin([])), [], "un ADMIN sans droit n'entend rien");
  assert.deepEqual(equipe.sallesEquipe(admin(["clients", "courses", "inconnue"])), ["equipe:courses", "equipe:clients"]);
  const proprietaire = equipe.sallesEquipe({ role: "DISPATCH" });
  assert.ok(proprietaire.includes("dispatch") && equipe.PERMISSIONS_EQUIPE.every((p) => proprietaire.includes(`equipe:${p}`)));
  assert.deepEqual(equipe.sallesEquipe({ role: "DRIVER" }), []);
  assert.deepEqual(PERMISSIONS.map((p) => p.key), equipe.PERMISSIONS_EQUIPE, "même liste que la page Admins");
});

test("SEC-02 : un évènement d'équipe ne part qu'aux salles des permissions concernées", () => {
  const envois = [];
  const io = { to: (salles) => ({ except: (sauf) => ({ emit: (e, d) => envois.push({ salles, sauf, e, d }) }), emit: (e, d) => envois.push({ salles, e, d }) }) };
  equipe.emettreEquipe(io, equipe.AUDIENCES.courses, "ride:updated", { id: "r1" });
  equipe.emettreEquipe(io, ["courses", "schedule"], "driver:updated", { id: "d1" }, { sauf: ["drivers"] });
  assert.deepEqual(envois[0].salles, ["equipe:courses", "equipe:schedule"]);
  assert.deepEqual(envois[1].sauf, ["equipe:drivers"]);
  assert.ok(!envois.some((x) => x.salles.includes("dispatch")));
});

test("SEC-02 : retirer une permission fait quitter tout de suite les salles et les suivis de course", async () => {
  const socket = { user: { id: "adm", role: "ADMIN", permissions: ["courses", "groups"] }, rooms: new Set(["sid", "user:adm", "equipe:courses", "equipe:groups", "ride:r1"]) };
  socket.leave = (s) => socket.rooms.delete(s);
  socket.join = (s) => socket.rooms.add(s);
  const io = { in: () => ({ fetchSockets: async () => [socket] }) };
  await equipe.actualiserSallesEquipe(io, { id: "adm", role: "ADMIN", permissions: ["groups"] });
  assert.deepEqual([...socket.rooms].sort(), ["equipe:groups", "sid", "user:adm"]);
  assert.deepEqual(socket.user.permissions, ["groups"], "les sockets connaissent les nouveaux droits (ride:watch)");
});

test("SEC-03 : la salle personnelle d'un compte d'équipe est la sienne, jamais « dispatch »", () => {
  assert.equal(personalRoom({ id: "adm1", role: "ADMIN" }), "user:adm1");
  assert.equal(personalRoom({ id: "d1", role: "DISPATCH" }), "user:d1");
  assert.equal(personalRoom({ id: "c1", role: "CLIENT" }), "user:c1");
  assert.equal(personalRoom({}), null);
});

test("SEC-02 : chaque suggestion exige l'une des permissions des pages qui s'en servent", () => {
  assert.deepEqual(PERMISSIONS_SUGGESTION.client, ["clients", "courses"]);
  for (const [champ, perms] of Object.entries(PERMISSIONS_SUGGESTION)) {
    assert.ok(perms.length > 0, champ);
    assert.equal(equipe.aPermission(admin([]), ...perms), false, `${champ} refusée sans droit`);
  }
});

// --- SEC-01 : messages internes ------------------------------------------------------------------

test("SEC-01 : le fil d'une course exclut tout message du fil direct Taxi Sylvain <-> chauffeur", () => {
  assert.deepEqual(FIL_DE_COURSE, { driverId: null });
  assert.equal(texteDeMessage("  bonjour  "), "bonjour");
  assert.equal(texteDeMessage("   "), null);
  assert.equal(texteDeMessage(42), null);
  assert.equal(texteDeMessage("x".repeat(LONGUEUR_MAX_MESSAGE + 1)), null, "SEC-14 : longueur bornée");
});

// --- SEC-05 / SEC-06 / B13 : création de course ----------------------------------------------------

test("SEC-05 : une réservation client ne retient que les champs d'une réservation", () => {
  const corps = {
    pickupAddress: "1 Rue A, Longueuil", destinationCode: "YUL", scheduledFor: "2026-10-10T14:00:00Z", stops: [],
    driverId: "chauffeur-x", broadcastAll: true, fare: -100, distanceKm: 1, clientId: "autre", newDriver: { name: "x" }, clientName: "x",
  };
  const garde = validation.champsReservationClient(corps);
  assert.deepEqual(Object.keys(garde).sort(), ["destinationCode", "pickupAddress", "scheduledFor", "stops"]);
});

test("SEC-06 / B13 : montants, distances, dates et coordonnées sont validés", () => {
  assert.equal(validation.montantCourse(-1), null);
  assert.equal(validation.montantCourse(-100), null);
  assert.equal(validation.montantCourse("12,5"), null, "virgule : refus explicite plutôt qu'une lecture approximative");
  assert.equal(validation.montantCourse("12.555"), 12.56);
  assert.equal(validation.montantCourse(0), 0);
  assert.equal(validation.montantCourse(1e9), null);
  for (const v of [null, "", true, [], {}, "abc", Infinity]) assert.equal(validation.montantCourse(v), null, String(v));
  assert.equal(validation.distanceSaisie(-10), null);
  assert.equal(validation.distanceSaisie("25.4"), 25.4);
  assert.deepEqual(validation.heureDePriseEnCharge("pas une date"), { erreur: "Date invalide." });
  assert.deepEqual(validation.heureDePriseEnCharge(true), { erreur: "Date invalide." });
  assert.deepEqual(validation.heureDePriseEnCharge(""), { date: null }, "course immédiate");
  assert.equal(validation.heureDePriseEnCharge("2026-10-10T14:00:00Z").date.toISOString(), "2026-10-10T14:00:00.000Z");
  assert.equal(validation.latitude(91), null);
  assert.equal(validation.longitude(-73.5), -73.5);
  assert.equal(validation.latitude("45"), null, "une chaîne n'est pas une coordonnée");
  assert.equal(validation.adresseValide("x".repeat(301)), false);
  assert.equal(validation.numeroDeVol("  AC 871  "), "AC 871");
});

// --- F05 : double validation ----------------------------------------------------------------------

test("F05 : deux envois simultanés d'une même saisie ne créent qu'une course", async () => {
  oublierTraitements();
  let appels = 0;
  const creer = async () => { appels += 1; await new Promise((r) => setTimeout(r, 20)); return { id: `course-${appels}` }; };
  const [a, b] = await Promise.all([unSeulTraitement("u1", "cle-saisie-0001", creer), unSeulTraitement("u1", "cle-saisie-0001", creer)]);
  assert.equal(appels, 1);
  assert.equal(a.resultat.id, b.resultat.id);
  assert.deepEqual([a.rejoue, b.rejoue].sort(), [false, true]);
  await unSeulTraitement("u2", "cle-saisie-0001", creer);
  assert.equal(appels, 2, "un autre compte avec la même clé : traitement distinct");
  await unSeulTraitement("u1", "trop", creer);
  assert.equal(appels, 3, "clé invalide : pas d'idempotence");
  await assert.rejects(unSeulTraitement("u1", "cle-en-echec-01", async () => { throw new Error("panne"); }));
  const reprise = await unSeulTraitement("u1", "cle-en-echec-01", async () => "réussi");
  assert.equal(reprise.resultat, "réussi", "une erreur libère la clé : on peut réessayer");
});

// --- SEC-04 / SEC-11 / SEC-12 / SEC-10 / SEC-18 : comptes et connexions --------------------------

test("SEC-04 : espaces et majuscules du courriel ne rouvrent pas le compteur de tentatives", async () => {
  viderCompteurs();
  const cle = (email) => cleTentatives({ ip: "203.0.113.5", body: { email } });
  assert.equal(cle(" Paul@Exemple.ca "), cle("paul@exemple.ca"));
  assert.equal(cle("\tPAUL@exemple.CA\n"), cle("paul@exemple.ca"));
  const limiteur = rateLimit({ windowMs: 60000, max: 20, keyFn: cleTentatives });
  const essai = (email) => new Promise((resolve) => {
    const res = { statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; }, json() { resolve(this.statusCode); } };
    limiteur({ ip: "203.0.113.5", body: { email } }, res, () => resolve(200));
  });
  for (let i = 0; i < 20; i++) await essai("paul@exemple.ca");
  assert.equal(await essai("paul@exemple.ca"), 429);
  assert.equal(await essai(" paul@exemple.ca"), 429, "variante avec espace : même compteur");
  assert.equal(await essai("PAUL@EXEMPLE.CA "), 429, "variante en majuscules : même compteur");
});

test("SEC-11 : le domaine technique des comptes Dispatch est refusé à l'inscription publique", () => {
  for (const e of ["audit@reservation.taxisylvain.local", " AUDIT@Reservation.TaxiSylvain.LOCAL ", "x@RESERVATION.taxisylvain.local"]) {
    assert.equal(erreurCourrielInscription(e), "Cette adresse courriel ne peut pas être utilisée.", e);
  }
  for (const e of ["pas-un-courriel", "a@b", "a b@c.ca", "x".repeat(250) + "@a.ca"]) assert.equal(erreurCourrielInscription(e), "Adresse courriel invalide.", e);
  assert.equal(erreurCourrielInscription("client@exemple.ca"), null);
  assert.equal(isPlaceholderEmail(" X@Reservation.TaxiSylvain.Local "), true, "détection insensible à la casse");
});

test("SEC-12 : les mots de passe temporaires sont tirés au sort par crypto", () => {
  const tirages = [];
  const faux = (min, max) => { tirages.push([min, max]); return 0; };
  assert.equal(generateTempPassword(12, faux), "A".repeat(12));
  assert.equal(tirages.length, 12);
  assert.ok(tirages.every(([min, max]) => min === 0 && max === ALPHABET_MOT_DE_PASSE.length));
  const reel = generateTempPassword();
  assert.equal(reel.length, 12);
  assert.ok([...reel].every((c) => ALPHABET_MOT_DE_PASSE.includes(c)));
  assert.notEqual(generateTempPassword(), generateTempPassword());
});

test("SEC-10 : le nom n'injecte aucune balise dans le courriel de confirmation", () => {
  const { html, text } = messageDuCode({ nom: "<b>AUDIT</b> Dupont", code: "123456" });
  assert.ok(!html.includes("<b>AUDIT"), "aucune balise venue du nom");
  assert.ok(html.includes("&lt;b&gt;AUDIT&lt;/b&gt;"), "le nom apparaît comme texte");
  assert.ok(text.includes("<b>AUDIT</b>"), "la version texte reste le texte saisi");
  assert.ok(!messageDuCode({ nom: `"><img src=x onerror=alert(1)>`, code: "1" }).html.includes("<img"));
});

test("SEC-18 : les comptes de démonstration ne visent qu'une base locale", () => {
  assert.equal(baseLocale("postgresql://u:p@localhost:5432/x", {}), true);
  assert.equal(baseLocale("postgresql://u:p@127.0.0.1:55433/x", {}), true);
  assert.equal(baseLocale("postgresql://u:p@monserveur.proxy.rlwy.net:5432/railway", {}), false);
  assert.equal(baseLocale("postgresql://u:p@localhost:5432/x", { NODE_ENV: "production" }), false);
  assert.equal(baseLocale("postgresql://u:p@localhost:5432/x", { RAILWAY_ENVIRONMENT: "production" }), false);
  assert.equal(baseLocale("pas une adresse", {}), false);
});

// --- SEC-13 : photos -------------------------------------------------------------------------------

const png = (l, h) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).copy(b, 0);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(l, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
const jpeg = (l, h) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, l >> 8, l & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
const webp = (l, h) => {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii"); b.writeUInt32LE(22, 4); b.write("WEBP", 8, "ascii"); b.write("VP8X", 12, "ascii");
  b.writeUInt32LE(10, 16); b.writeUIntLE(l - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3);
  return b;
};

test("SEC-13 : seules de vraies images JPEG, PNG et WebP du type annoncé sont gardées", () => {
  assert.deepEqual(analyserImage(png(800, 600)), { type: "image/png", largeur: 800, hauteur: 600 });
  assert.deepEqual(analyserImage(jpeg(1024, 768)), { type: "image/jpeg", hauteur: 768, largeur: 1024 });
  assert.deepEqual(analyserImage(webp(640, 480)), { type: "image/webp", largeur: 640, hauteur: 480 });
  assert.equal(verdictImage(png(800, 600), "image/png").ok, true);
  assert.equal(verdictImage(Buffer.from("<html><script>alert(1)</script></html>"), "image/jpeg").ok, false, "page HTML renommée");
  assert.equal(verdictImage(Buffer.from("texte quelconque, pas une image du tout"), "image/png").ok, false);
  assert.equal(verdictImage(png(800, 600), "image/jpeg").ok, false, "type annoncé différent du contenu");
  assert.equal(verdictImage(png(800, 600).subarray(0, 10), "image/png").ok, false, "fichier tronqué");
  assert.match(verdictImage(png(50000, 600), "image/png").raison, /trop grande/);
  assert.equal(verdictImage(png(4, 4), "image/png").ok, false, "image minuscule");
});

// --- B07 / B08 : municipalité et tarif -------------------------------------------------------------

const zones = [{ name: "Chambly" }, { name: "Québec" }, { name: "Longueuil" }, { name: "Saint-Jean-sur-Richelieu" }, { name: "Lévis" }];

test("B07 : un nom de rue ne déclenche plus le tarif d'une autre municipalité", () => {
  assert.equal(matchZone("12 Rue de Chambly, Montréal, QC H2X 1A1", zones), null, "Montréal n'est pas dans la grille");
  assert.equal(matchZone("12 Rue de Chambly, Longueuil, QC J4H 1A1", zones)?.name, "Longueuil");
  assert.equal(matchZone("1580 Avenue Bourgogne, Chambly, QC J3L 2Y7", zones)?.name, "Chambly");
  assert.equal(matchZone("12 Rue X, Vieux-Longueuil, QC", zones)?.name, "Longueuil", "quartier contenant la municipalité");
  assert.equal(matchZone("12 rue X Chambly QC J3L 2Y7", zones)?.name, "Chambly", "sans virgule : la fin du texte compte");
  assert.equal(matchZone("12 rue de Chambly Montréal QC", zones), null, "sans virgule : la rue ne compte plus");
});

test("B08 : la ville de Québec est reconnue dans la forme unique d'adresse", () => {
  assert.equal(matchZone("12 Rue Exemple, Québec, QC G1R 1A1", zones)?.name, "Québec");
  assert.equal(matchZone("1037 Rue de la Chevrotière, Québec, Capitale-Nationale, QC G1R 4Y3", zones)?.name, "Québec");
  assert.equal(matchZone("12 Rue Exemple, Lévis, Québec", zones)?.name, "Lévis", "Québec en fin = la province");
  assert.equal(matchZone("12 Rue Exemple, Montréal, Québec", zones), null);
  assert.equal(estVilleDeQuebec(["12 Rue X", "Québec", "QC G1R 1A1"], 1), true);
  assert.equal(estVilleDeQuebec(["12 Rue X", "Lévis", "Québec"], 2), false);
});

test("B08 : le nettoyage d'une adresse garde la ville de Québec et le tarif ne bouge pas", () => {
  const avant = "1037 Rue de la Chevrotière, Québec, Capitale-Nationale, QC G1R 4Y3";
  const apres = cleanAddressText(avant);
  assert.match(apres, /Chevrotière, Québec, /, "la ville reste « Québec »");
  assert.equal(matchZone(apres, zones)?.name, "Québec");
  assert.equal(cleanAddressText("12 Rue Exemple, Québec, QC G1R 1A1"), "12 Rue Exemple, Québec, QC G1R 1A1");
  assert.equal(cleanAddressText("12 Rue Exemple, Lévis, Québec, G6V 1A1"), "12 Rue Exemple, Lévis, QC G6V 1A1", "la province devient QC");
});

// --- B11 : import CSV ------------------------------------------------------------------------------

test("B11 : CSV à points-virgules, mémo sur plusieurs lignes, guillemets doublés et numéros de ligne", () => {
  const csv = 'Nom;Courriel;Téléphone;Mémo et préférences\n"Dupont; Marie";marie@x.ca;5145550001;"Bagages lourds\nappeler avant ""arrivée"""\nTremblay;jean@x.ca;5145550002;\n\n';
  assert.equal(separateurDuCsv(csv), ";");
  const lignes = parseCsv(csv);
  assert.equal(lignes.length, 2, "le mémo sur deux lignes reste UN client");
  assert.equal(pick(lignes[0], "nom"), "Dupont; Marie");
  assert.equal(pick(lignes[0], "telephone", "téléphone"), "5145550001");
  assert.equal(pick(lignes[0], "mémo et préférences"), 'Bagages lourds\nappeler avant "arrivée"', "alias accentué trouvé");
  assert.equal(lignes[1]._ligne, 4, "numéro de la ligne dans le fichier");
});

test("B11 : CSV à virgules, BOM et encodage Windows-1252 d'Excel", () => {
  const utf8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Nom,Téléphone\nÉloïse,5145550003\n", "utf8")]);
  assert.equal(pick(parseCsv(texteDuCsv(utf8))[0], "nom"), "Éloïse");
  const latin = Buffer.from([...Buffer.from("Nom;T"), 0xe9, ...Buffer.from("l"), 0xe9, ...Buffer.from("phone\n"), 0xc9, ...Buffer.from("lo"), 0xef, ...Buffer.from("se;5145550004\n")]);
  const ligne = parseCsv(texteDuCsv(latin))[0];
  assert.equal(pick(ligne, "nom"), "Éloïse");
  assert.equal(pick(ligne, "téléphone"), "5145550004");
});

// --- SEC-15 : sauvegardes ----------------------------------------------------------------------------

const sauvegardeFictive = ({ orpheline = false } = {}) => ({
  format: sauvegarde.FORMAT, version: 2, creeLe: "2026-10-07T08:00:00.000Z", migrations: [],
  tables: {
    User: [{ id: "u1" }, { id: "u2" }],
    Ride: [{ id: "r1", clientId: "u1", driverId: "u2" }, { id: "r2", clientId: orpheline ? "u-efface" : "u1", driverId: null }],
  },
  comptes: { User: 2, Ride: 2 },
  liens: [
    { enfant: "Ride", parent: "User", colonnes: ["clientId"], colonnesParent: ["id"] },
    { enfant: "Ride", parent: "User", colonnes: ["driverId"], colonnesParent: ["id"] },
  ],
});

test("SEC-15 : une référence orpheline est détectée et la sauvegarde refusée", () => {
  assert.deepEqual(sauvegarde.verifierRelations(sauvegardeFictive()), []);
  const orphelins = sauvegarde.verifierRelations(sauvegardeFictive({ orpheline: true }));
  assert.deepEqual(orphelins, [{ table: "Ride", colonnes: ["clientId"], valeur: "u-efface", parent: "User" }]);
  const fichier = zlib.gzipSync(Buffer.from(JSON.stringify(sauvegardeFictive({ orpheline: true }))));
  assert.throws(() => sauvegarde.lireFichierSauvegarde(fichier), /incohérente : 1 référence/);
  const bon = zlib.gzipSync(Buffer.from(JSON.stringify(sauvegardeFictive())));
  assert.equal(sauvegarde.lireFichierSauvegarde(bon).tables.Ride.length, 2);
  const ancienne = { ...sauvegardeFictive({ orpheline: true }), liens: undefined };
  assert.deepEqual(sauvegarde.verifierRelations(ancienne), [], "sauvegarde d'avant le 7 octobre : rien à vérifier");
});

test("SEC-15 : la copie externe est chiffrée (AES-256-GCM) et illisible sans la bonne clé", () => {
  const cle = crypto.randomBytes(32);
  const donnees = zlib.gzipSync(Buffer.from(JSON.stringify(sauvegardeFictive())));
  const paquet = sauvegarde.chiffrerSauvegarde(donnees, cle);
  assert.ok(!paquet.includes(donnees.subarray(10, 40)), "aucun extrait en clair");
  assert.deepEqual(sauvegarde.dechiffrerSauvegarde(paquet, cle), donnees);
  assert.throws(() => sauvegarde.dechiffrerSauvegarde(paquet, crypto.randomBytes(32)));
  const abime = Buffer.from(paquet); abime[abime.length - 1] ^= 1;
  assert.throws(() => sauvegarde.dechiffrerSauvegarde(abime, cle), undefined, "toute altération est détectée");
  assert.equal(sauvegarde.cleCopieExterne(cle.toString("base64")).length, 32);
  assert.equal(sauvegarde.cleCopieExterne("trop-courte"), null);
  assert.equal(sauvegarde.cleCopieExterne(""), null);
});

// --- OPS-02 : Nominatim ------------------------------------------------------------------------------

test("OPS-02 : une seule requête par seconde vers le serveur public, et pas de file infinie", async () => {
  reinitialiserNominatim();
  let maintenant = 1_000_000;
  const attentes = [];
  const horloge = () => maintenant;
  const attendre = async (ms) => { attentes.push(ms); };
  await auRythme(async () => "a", { horloge, attendre });
  await auRythme(async () => "b", { horloge, attendre });
  await auRythme(async () => "c", { horloge, attendre });
  assert.deepEqual(attentes, [INTERVALLE_MS, 2 * INTERVALLE_MS], "requêtes espacées de 1,1 s");

  reinitialiserNominatim();
  let liberer;
  const porte = new Promise((r) => { liberer = r; });
  const enCours = Array.from({ length: ATTENTE_MAX }, () => auRythme(() => porte, { horloge, attendre: async () => {} }));
  assert.equal(await auRythme(async () => "de trop", { horloge, attendre }), null, "au-delà de la file : réponse vide immédiate");
  liberer("ok");
  assert.deepEqual(await Promise.all(enCours), Array(ATTENTE_MAX).fill("ok"));
  reinitialiserNominatim();
});

// --- SEC-16 : appel masqué -----------------------------------------------------------------------------

function fauxServiceTwilio() {
  const sessions = new Map();
  const journal = [];
  let n = 0;
  const acces = (cle) => ({
    fetch: async () => { const s = sessions.get(cle); if (!s) throw new Error("404"); return s; },
    remove: async () => { const s = sessions.get(cle); journal.push(`remove:${cle}`); if (!s) throw new Error("404"); sessions.delete(s.sid); sessions.delete(s.uniqueName); return true; },
    participants: {
      list: async () => [...(sessions.get(cle)?.participants || [])],
      create: async ({ identifier }) => { const p = { identifier, proxyIdentifier: "+14385550999" }; sessions.get(cle).participants.push(p); return p; },
    },
  });
  const service = { sessions: Object.assign((cle) => acces(cle), { create: async ({ uniqueName }) => { const s = { sid: `KC${++n}`, uniqueName, status: "open", participants: [] }; sessions.set(s.sid, s); sessions.set(uniqueName, s); journal.push(`create:${uniqueName}`); return s; } }) };
  return { service, sessions, journal };
}

test("SEC-16 : un chauffeur remplacé n'est plus relié au client par l'appel masqué", async () => {
  const { service, sessions, journal } = fauxServiceTwilio();
  const client = { name: "Client", phone: "514 555-0001" };
  await getOrCreateCallSession({ id: "r1", client, driver: { name: "A", phone: "514 555-0002" } }, { service });
  await getOrCreateCallSession({ id: "r1", client, driver: { name: "B", phone: "514 555-0003" } }, { service });
  const participants = sessions.get("ride-r1").participants.map((p) => p.identifier).sort();
  assert.deepEqual(participants, ["+15145550001", "+15145550003"], "seuls le client et le nouveau chauffeur");
  assert.deepEqual(journal, ["create:ride-r1", "remove:KC1", "create:ride-r1"]);
  assert.equal(await fermerSessionAppel("r1", { service }), true, "fermeture à l'annulation, la suppression ou la fin");
  assert.equal(sessions.has("ride-r1"), false);
  assert.equal(await fermerSessionAppel("r1", { service }), false, "rien à fermer : jamais bloquant");
});

// --- SEC-14 : positions GPS ----------------------------------------------------------------------------

test("SEC-14 : une position GPS doit être deux nombres finis dans les bornes de la Terre", () => {
  assert.equal(positionValide(45.5, -73.6), true);
  for (const [lat, lng] of [[91, 0], [0, 181], [NaN, 1], [Infinity, 1], ["45", "-73"], [null, null]]) assert.equal(positionValide(lat, lng), false, `${lat},${lng}`);
});
