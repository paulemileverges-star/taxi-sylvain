// Sauvegarde quotidienne de la base, sans compte ni service payant.
//
// Pourquoi : Railway ne propose les sauvegardes automatiques de Postgres qu'à la formule Pro
// (20 USD par mois) ; aux formules Essai et Hobby, une base effacée ou abîmée (fausse manœuvre,
// script raté, compte suspendu) ne se récupère pas. Constat du 6 octobre 2026.
//
// Comment : chaque table est lue en JSON par Postgres lui-même (json_agg), le tout est compressé
// et écrit sur le disque persistant, dans le dossier caché .sauvegardes/. Les 14 dernières sont
// gardées. Ce dossier est sous /app/uploads, qui est servi en public : il est protégé par la règle
// « dotfiles: deny » de fichiersPublics() (voir plus bas), testée. Une copie hors de Railway se
// récupère sur le PC avec scripts/recuperer-sauvegarde.mjs (racine du dépôt).
//
// Restauration : backend/scripts/restaurer-sauvegarde.mjs (refuse une base distante sans
// --production, vérifie les migrations et les nombres de lignes).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import express from "express";
import { prisma } from "./prisma.js";
import { uploadsDir } from "./uploads.js";
import { FUSEAU_TAXI } from "./ridesOrder.js";

export const FORMAT = "taxi-sylvain-sauvegarde";
export const CONSERVATION = 14;
// SAUVEGARDES_DOSSIER : seulement pour les essais locaux (scénario de bout en bout), qui ne doivent
// rien laisser dans le dépôt. En production, la variable est absente.
export const sauvegardesDir = process.env.SAUVEGARDES_DOSSIER || path.join(uploadsDir, ".sauvegardes");
const MOTIF = /^taxi-sylvain-\d{4}-\d{2}-\d{2}-\d{4}\.json\.gz$/;

const PARTIES = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU_TAXI, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** Nom du fichier, à l'heure du Québec : taxi-sylvain-AAAA-MM-JJ-HHMM.json.gz (l'ordre alphabétique est l'ordre chronologique). */
export function nomSauvegarde(date = new Date()) {
  const p = Object.fromEntries(PARTIES.formatToParts(date).map((x) => [x.type, x.value]));
  return `taxi-sylvain-${p.year}-${p.month}-${p.day}-${String(Number(p.hour) % 24).padStart(2, "0")}${p.minute}.json.gz`;
}

/** Sauvegardes présentes, de la plus récente à la plus ancienne (les autres fichiers sont ignorés). */
export function trierSauvegardes(fichiers) {
  return fichiers.filter((f) => MOTIF.test(f)).sort().reverse();
}

/** Les fichiers à effacer pour n'en garder que `garder`. Jamais un fichier qui n'est pas une sauvegarde. */
export function aEffacer(fichiers, garder = CONSERVATION) {
  return trierSauvegardes(fichiers).slice(Math.max(1, garder));
}

/** Âge, en heures, de la sauvegarde la plus récente (Infinity s'il n'y en a aucune). */
export function ageDerniereHeures(fichiers, maintenant = new Date()) {
  const derniere = trierSauvegardes(fichiers)[0];
  if (!derniere) return Infinity;
  const m = derniere.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/);
  // Heure du Québec lue comme UTC : l'écart (4 ou 5 h) est compensé en comparant au même repère.
  const repere = nomSauvegarde(maintenant).match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/);
  const enMs = (x) => Date.UTC(+x[1], +x[2] - 1, +x[3], +x[4], +x[5]);
  return (enMs(repere) - enMs(m)) / 3600000;
}

const guillemets = (nom) => `"${String(nom).replace(/"/g, '""')}"`;

// Liens entre tables (clés étrangères), lus dans le catalogue de PostgreSQL : enregistrés dans la
// sauvegarde pour pouvoir vérifier, avant toute restauration, que chaque référence existe.
const REQUETE_LIENS = `
  SELECT enfant.relname::text AS enfant, parent.relname::text AS parent,
    (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY AS k(num, ord)
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.num) AS colonnes,
    (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY AS k(num, ord)
       JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.num) AS "colonnesParent"
  FROM pg_constraint c
  JOIN pg_class enfant ON enfant.oid = c.conrelid
  JOIN pg_class parent ON parent.oid = c.confrelid
  JOIN pg_namespace n ON n.oid = enfant.relnamespace
  WHERE c.contype = 'f' AND n.nspname = 'public'`;

/**
 * Lit toute la base : { format, version, creeLe, migrations, comptes, tables, liens }.
 *
 * Audit du 7 octobre 2026 (SEC-15) : les tables étaient lues l'une après l'autre, chacune à un instant
 * différent. Une course supprimée ou un compte effacé ENTRE deux lectures donnait une sauvegarde
 * incohérente (course rattachée à un compte absent), acceptée puis impossible à restaurer. Toutes les
 * lectures se font désormais dans UNE transaction en lecture seule, de niveau REPEATABLE READ : elles
 * voient toutes la même photographie de la base, quelles que soient les écritures en cours.
 */
export async function lireBase(client = prisma) {
  const lire = async (db) => {
    const tables = await db.$queryRawUnsafe(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
    );
    const contenu = { format: FORMAT, version: 2, creeLe: new Date().toISOString(), migrations: [], comptes: {}, tables: {}, liens: [] };
    for (const { table_name: nom } of tables) {
      const [{ lignes }] = await db.$queryRawUnsafe(`SELECT COALESCE(json_agg(t), '[]'::json) AS lignes FROM ${guillemets(nom)} t`);
      contenu.tables[nom] = lignes;
      contenu.comptes[nom] = lignes.length;
    }
    contenu.liens = (await db.$queryRawUnsafe(REQUETE_LIENS)).map((l) => ({
      enfant: l.enfant, parent: l.parent, colonnes: l.colonnes || [], colonnesParent: l.colonnesParent || [],
    }));
    contenu.migrations = (contenu.tables._prisma_migrations || [])
      .filter((m) => m.finished_at && !m.rolled_back_at)
      .map((m) => m.migration_name)
      .sort();
    return contenu;
  };
  if (typeof client.$transaction !== "function") return lire(client);
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return lire(tx);
  }, { isolationLevel: "RepeatableRead", timeout: 5 * 60 * 1000, maxWait: 30 * 1000 });
}

/**
 * Références orphelines d'une sauvegarde : une ligne qui pointe vers une ligne absente de la table
 * visée. Liste vide = sauvegarde cohérente. Les sauvegardes d'avant le 7 octobre 2026 (sans liens
 * enregistrés) ne peuvent pas être vérifiées ainsi : liste vide.
 */
export function verifierRelations(contenu) {
  const orphelins = [];
  for (const lien of contenu?.liens || []) {
    const enfants = contenu.tables?.[lien.enfant];
    const parents = contenu.tables?.[lien.parent];
    if (!Array.isArray(enfants) || !Array.isArray(parents) || !lien.colonnes.length) continue;
    const cle = (ligne, colonnes) => colonnes.map((c) => String(ligne[c])).join("\u0000");
    const connues = new Set(parents.map((p) => cle(p, lien.colonnesParent)));
    for (const ligne of enfants) {
      if (lien.colonnes.some((c) => ligne[c] === null || ligne[c] === undefined)) continue;
      if (!connues.has(cle(ligne, lien.colonnes))) {
        orphelins.push({ table: lien.enfant, colonnes: lien.colonnes, valeur: lien.colonnes.map((c) => ligne[c]).join(", "), parent: lien.parent });
      }
    }
  }
  return orphelins;
}

function refuserSiIncoherente(contenu) {
  const orphelins = verifierRelations(contenu);
  if (orphelins.length) {
    const exemples = orphelins.slice(0, 3).map((o) => `${o.table}.${o.colonnes.join("+")} = ${o.valeur} (absent de ${o.parent})`).join(" ; ");
    throw new Error(`Sauvegarde incohérente : ${orphelins.length} référence(s) orpheline(s), par exemple ${exemples}.`);
  }
}

/** Fait une sauvegarde maintenant et efface les plus anciennes. Rend { fichier, octets, comptes }. */
export async function faireSauvegarde({ client = prisma, dossier = sauvegardesDir, maintenant = new Date() } = {}) {
  fs.mkdirSync(dossier, { recursive: true });
  const contenu = await lireBase(client);
  // Jamais de fichier écrit pour une photographie incohérente : l'erreur part en alerte.
  refuserSiIncoherente(contenu);
  const nom = nomSauvegarde(maintenant);
  const donnees = zlib.gzipSync(Buffer.from(JSON.stringify(contenu), "utf8"), { level: 9 });
  // Écriture dans un fichier temporaire puis renommage : jamais de sauvegarde à moitié écrite.
  const temporaire = path.join(dossier, `${nom}.partiel`);
  fs.writeFileSync(temporaire, donnees);
  fs.renameSync(temporaire, path.join(dossier, nom));
  for (const ancien of aEffacer(fs.readdirSync(dossier))) fs.rmSync(path.join(dossier, ancien), { force: true });
  return { fichier: nom, octets: donnees.length, comptes: contenu.comptes };
}

/** Sauvegarde de rattrapage au démarrage : seulement si la dernière date de plus de `heures`. */
export async function sauvegardeSiAncienne({ heures = 20, ...options } = {}) {
  const dossier = options.dossier || sauvegardesDir;
  let fichiers = [];
  try { fichiers = fs.readdirSync(dossier); } catch { fichiers = []; }
  if (ageDerniereHeures(fichiers) < heures) return null;
  return faireSauvegarde(options);
}

/** Ligne affichée dans les journaux de Railway au démarrage. */
export function sauvegardesStatusLine(dossier = sauvegardesDir) {
  let fichiers = [];
  try { fichiers = trierSauvegardes(fs.readdirSync(dossier)); } catch { fichiers = []; }
  if (fichiers.length === 0) return "Sauvegardes de la base : aucune pour l'instant (une première est faite au démarrage, puis chaque nuit à 3 h 30).";
  return `Sauvegardes de la base : ${fichiers.length}, la plus récente ${fichiers[0]} (chaque nuit à 3 h 30, ${CONSERVATION} gardées).`;
}

/** Relit un fichier de sauvegarde (Buffer gzip) et vérifie qu'il est complet. */
export function lireFichierSauvegarde(donnees) {
  const contenu = JSON.parse(zlib.gunzipSync(donnees).toString("utf8"));
  if (contenu?.format !== FORMAT || !contenu.tables) throw new Error("Ce fichier n'est pas une sauvegarde Taxi Sylvain.");
  for (const [nom, lignes] of Object.entries(contenu.tables)) {
    if (!Array.isArray(lignes) || lignes.length !== contenu.comptes?.[nom]) throw new Error(`Table ${nom} incomplète dans la sauvegarde.`);
  }
  // Chaque référence doit exister (sauvegardes à partir du 7 octobre 2026) : une sauvegarde
  // incohérente est refusée ici, avant toute restauration.
  refuserSiIncoherente(contenu);
  return contenu;
}

// Copie hors du disque de Railway (audit du 7 octobre 2026, SEC-15) : les sauvegardes sont sur le même
// disque que les photos ; perdre ce disque, c'était perdre aussi les sauvegardes. Chaque semaine, la
// plus récente part par courriel, CHIFFRÉE (AES-256-GCM), à l'adresse SAUVEGARDE_COURRIEL. La clé
// (SAUVEGARDE_CLE, 32 octets en base64) n'est jamais envoyée : le propriétaire la garde à part ; sans
// elle, la pièce jointe est illisible. Déchiffrement : scripts/dechiffrer-sauvegarde.mjs.
const ENTETE_CHIFFRE = Buffer.from("TSAUV1");

/** Clé de chiffrement de la copie externe (Buffer de 32 octets), ou null si absente ou invalide. */
export function cleCopieExterne(valeur = process.env.SAUVEGARDE_CLE) {
  if (typeof valeur !== "string" || !valeur.trim()) return null;
  const cle = Buffer.from(valeur.trim(), "base64");
  return cle.length === 32 ? cle : null;
}

export function chiffrerSauvegarde(donnees, cle) {
  const iv = crypto.randomBytes(12);
  const chiffreur = crypto.createCipheriv("aes-256-gcm", cle, iv);
  const chiffre = Buffer.concat([chiffreur.update(donnees), chiffreur.final()]);
  return Buffer.concat([ENTETE_CHIFFRE, iv, chiffreur.getAuthTag(), chiffre]);
}

export function dechiffrerSauvegarde(paquet, cle) {
  if (!Buffer.isBuffer(paquet) || !paquet.subarray(0, ENTETE_CHIFFRE.length).equals(ENTETE_CHIFFRE)) {
    throw new Error("Ce fichier n'est pas une copie chiffrée de sauvegarde Taxi Sylvain.");
  }
  const debut = ENTETE_CHIFFRE.length;
  const iv = paquet.subarray(debut, debut + 12);
  const tag = paquet.subarray(debut + 12, debut + 28);
  const dechiffreur = crypto.createDecipheriv("aes-256-gcm", cle, iv);
  dechiffreur.setAuthTag(tag);
  return Buffer.concat([dechiffreur.update(paquet.subarray(debut + 28)), dechiffreur.final()]);
}

export function copieExterneStatusLine() {
  if (!process.env.SAUVEGARDE_COURRIEL && !process.env.SAUVEGARDE_CLE) return "Copie externe des sauvegardes : inactive (SAUVEGARDE_COURRIEL et SAUVEGARDE_CLE absentes).";
  if (!cleCopieExterne()) return "Copie externe des sauvegardes : INACTIVE, SAUVEGARDE_CLE invalide (32 octets en base64 attendus).";
  if (!process.env.SAUVEGARDE_COURRIEL) return "Copie externe des sauvegardes : INACTIVE, SAUVEGARDE_COURRIEL absente.";
  return "Copie externe des sauvegardes : active (chaque dimanche, chiffrée, par courriel).";
}

/** Envoie la sauvegarde la plus récente, chiffrée. Rend { envoye } ou { ignore: raison }. */
export async function envoyerCopieExterne({ dossier = sauvegardesDir, envoyer, maintenant = new Date() } = {}) {
  const cle = cleCopieExterne();
  const destinataire = process.env.SAUVEGARDE_COURRIEL;
  if (!cle || !destinataire) return { ignore: "copie-externe-inactive" };
  let fichiers = [];
  try { fichiers = fs.readdirSync(dossier); } catch { fichiers = []; }
  const derniere = trierSauvegardes(fichiers)[0];
  if (!derniere) return { ignore: "aucune-sauvegarde" };
  const paquet = chiffrerSauvegarde(fs.readFileSync(path.join(dossier, derniere)), cle);
  const { sendMail } = envoyer ? { sendMail: envoyer } : await import("./mailer.js");
  const resultat = await sendMail({
    to: destinataire,
    subject: `Sauvegarde chiffrée Taxi Sylvain du ${derniere.slice(13, 23)}`,
    text: `Copie hebdomadaire de la base, chiffrée. Pièce jointe : ${derniere}.chiffre (${Math.round(paquet.length / 1024)} Ko).

Illisible sans la clé gardée à part. Pour la relire : node backend/scripts/dechiffrer-sauvegarde.mjs "<fichier .chiffre>" (voir docs/PASSATION.md).`,
    html: `<p>Copie hebdomadaire de la base, chiffrée : <b>${derniere}.chiffre</b> (${Math.round(paquet.length / 1024)} Ko).</p><p>Illisible sans la clé gardée à part. Pour la relire : <code>node backend/scripts/dechiffrer-sauvegarde.mjs</code> (voir docs/PASSATION.md).</p>`,
    pieceJointe: { filename: `${derniere}.chiffre`, contentBase64: paquet.toString("base64"), contentType: "application/octet-stream" },
  });
  if (!resultat?.ok) throw new Error(`Copie externe non envoyée : ${resultat?.error || "erreur inconnue"}`);
  return { envoye: true, fichier: derniere, octets: paquet.length, le: maintenant.toISOString() };
}

/** État des sauvegardes pour la surveillance (sans aucune donnée personnelle). */
export function etatSauvegardes(dossier = sauvegardesDir, maintenant = new Date()) {
  let fichiers = [];
  try { fichiers = fs.readdirSync(dossier); } catch { fichiers = []; }
  const age = ageDerniereHeures(fichiers, maintenant);
  return { nombre: trierSauvegardes(fichiers).length, ageHeures: Number.isFinite(age) ? Math.round(age * 10) / 10 : null, enRetard: !(age <= 30) };
}

/**
 * Ordre d'insertion pour une restauration : chaque table après celles qu'elle référence (User avant
 * Ride, Ride avant Rating...). `liens` = [{ enfant, parent }] lus dans pg_constraint. Une référence
 * d'une table à elle-même est ignorée ; un cycle entre tables arrête tout (aucun n'existe à ce jour).
 */
export function ordreInsertion(tables, liens) {
  const restantes = new Set(tables);
  const parents = new Map(tables.map((t) => [t, new Set()]));
  for (const { enfant, parent } of liens) {
    if (enfant !== parent && parents.has(enfant) && parents.has(parent)) parents.get(enfant).add(parent);
  }
  const ordre = [];
  while (restantes.size > 0) {
    const pretes = [...restantes].filter((t) => [...parents.get(t)].every((p) => !restantes.has(p))).sort();
    if (pretes.length === 0) throw new Error(`Références circulaires entre les tables : ${[...restantes].join(", ")}.`);
    for (const t of pretes) { ordre.push(t); restantes.delete(t); }
  }
  return ordre;
}

/**
 * Fichiers du disque persistant servis sous /uploads (photos, APK). « dotfiles: deny » refuse tout
 * chemin dont un élément commence par un point, y compris encodé (%2E) : le dossier .sauvegardes/
 * n'est jamais lisible depuis Internet. Par défaut, Express servirait les fichiers rangés dans un
 * dossier caché ; d'où ce réglage explicite, vérifié par test/sauvegarde.test.js.
 */
export function fichiersPublics(dossier = uploadsDir) {
  return express.static(dossier, {
    fallthrough: true,
    dotfiles: "deny",
    setHeaders: (res, filePath) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (filePath.endsWith(".apk")) {
        // Fichiers d'installation Android (dossier apk/ du disque persistant, déposés à la main) :
        // servis comme pièce jointe nommée, sans bac à sable, pour que Chrome Android termine le
        // téléchargement et propose l'installation.
        const nom = filePath.split(/[\\/]/).pop();
        res.setHeader("Content-Disposition", `attachment; filename="${nom}"`);
        return;
      }
      res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; sandbox");
    },
  });
}
