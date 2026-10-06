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

/** Lit toute la base : { format, version, creeLe, migrations, comptes, tables }. */
export async function lireBase(client = prisma) {
  const tables = await client.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  const contenu = { format: FORMAT, version: 1, creeLe: new Date().toISOString(), migrations: [], comptes: {}, tables: {} };
  for (const { table_name: nom } of tables) {
    const [{ lignes }] = await client.$queryRawUnsafe(`SELECT COALESCE(json_agg(t), '[]'::json) AS lignes FROM ${guillemets(nom)} t`);
    contenu.tables[nom] = lignes;
    contenu.comptes[nom] = lignes.length;
  }
  contenu.migrations = (contenu.tables._prisma_migrations || [])
    .filter((m) => m.finished_at && !m.rolled_back_at)
    .map((m) => m.migration_name)
    .sort();
  return contenu;
}

/** Fait une sauvegarde maintenant et efface les plus anciennes. Rend { fichier, octets, comptes }. */
export async function faireSauvegarde({ client = prisma, dossier = sauvegardesDir, maintenant = new Date() } = {}) {
  fs.mkdirSync(dossier, { recursive: true });
  const contenu = await lireBase(client);
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
  return contenu;
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
