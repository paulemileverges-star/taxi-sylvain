#!/usr/bin/env node
// Restauration d'une sauvegarde de la base (fichier taxi-sylvain-AAAA-MM-JJ-HHMM.json.gz, voir
// src/lib/sauvegarde.js). À lancer depuis backend/, APRÈS avoir créé les tables vides :
//   npx prisma migrate deploy
//   node scripts/restaurer-sauvegarde.mjs <fichier>                          -> vérifie et compare, n'écrit rien
//   node scripts/restaurer-sauvegarde.mjs <fichier> --appliquer              -> remplace tout le contenu (base locale)
//   node scripts/restaurer-sauvegarde.mjs <fichier> --appliquer --production -> idem sur une base distante
// Garde-fous : sans --appliquer rien n'est écrit ; une base qui n'est pas sur localhost exige
// --production en plus ; les migrations de la base et de la sauvegarde doivent être identiques ;
// tout se fait dans une seule transaction (en cas d'erreur, la base reste comme avant) ; les
// nombres de lignes sont recomptés à la fin.
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { lireFichierSauvegarde, ordreInsertion } from "../src/lib/sauvegarde.js";

const fichier = process.argv.slice(2).find((a) => !a.startsWith("--"));
const APPLIQUER = process.argv.includes("--appliquer");
const PRODUCTION = process.argv.includes("--production");
if (!fichier) {
  console.error("Usage : node scripts/restaurer-sauvegarde.mjs <fichier.json.gz> [--appliquer] [--production]");
  process.exit(2);
}
const locale = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || "");
if (APPLIQUER && !locale && !PRODUCTION) {
  console.error("ARRÊT : la base configurée n'est pas locale. Ajoutez --production si c'est voulu.");
  process.exit(2);
}

const q = (nom) => `"${String(nom).replace(/"/g, '""')}"`;
const contenu = lireFichierSauvegarde(fs.readFileSync(fichier));
console.log(`Sauvegarde du ${contenu.creeLe} : ${Object.keys(contenu.tables).length} tables, ${contenu.migrations.length} migrations.`);

const prisma = new PrismaClient();
try {
  const appliquees = (await prisma.$queryRawUnsafe(
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name"
  )).map((m) => m.migration_name);
  const manquantes = contenu.migrations.filter((m) => !appliquees.includes(m));
  const enTrop = appliquees.filter((m) => !contenu.migrations.includes(m));
  if (manquantes.length || enTrop.length) {
    console.error("ARRÊT : la base et la sauvegarde n'ont pas les mêmes migrations.");
    if (manquantes.length) console.error("  absentes de la base :", manquantes.join(", "), "(lancer npx prisma migrate deploy avec le code de la même époque)");
    if (enTrop.length) console.error("  plus récentes que la sauvegarde :", enTrop.join(", "));
    process.exit(3);
  }

  const tablesBase = (await prisma.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'"
  )).map((t) => t.table_name);
  const tablesSauvegarde = Object.keys(contenu.tables).filter((t) => t !== "_prisma_migrations");
  const differentes = [...tablesBase.filter((t) => !tablesSauvegarde.includes(t)), ...tablesSauvegarde.filter((t) => !tablesBase.includes(t))];
  if (differentes.length) {
    console.error("ARRÊT : tables différentes entre la base et la sauvegarde :", differentes.join(", "));
    process.exit(3);
  }

  const liens = await prisma.$queryRawUnsafe(`
    SELECT enfant.relname AS enfant, parent.relname AS parent
    FROM pg_constraint c
    JOIN pg_class enfant ON enfant.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = enfant.relnamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'`);
  const ordre = ordreInsertion(tablesSauvegarde, liens);

  const compter = async (client) => {
    const r = {};
    for (const t of ordre) r[t] = Number((await client.$queryRawUnsafe(`SELECT count(*)::int AS n FROM ${q(t)}`))[0].n);
    return r;
  };
  const avant = await compter(prisma);
  console.log("\nTable                      base actuelle -> sauvegarde");
  for (const t of ordre) console.log(`${t.padEnd(28)}${String(avant[t]).padStart(8)} -> ${contenu.comptes[t]}`);

  if (!APPLIQUER) {
    console.log("\nRien n'a été écrit. Relancer avec --appliquer pour remplacer le contenu de la base par la sauvegarde.");
    process.exit(0);
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`TRUNCATE ${ordre.map(q).join(", ")}`);
    for (const t of ordre) {
      const lignes = contenu.tables[t];
      for (let i = 0; i < lignes.length; i += 500) {
        await tx.$executeRawUnsafe(
          `INSERT INTO ${q(t)} SELECT * FROM json_populate_recordset(NULL::${q(t)}, $1::json)`,
          JSON.stringify(lignes.slice(i, i + 500))
        );
      }
    }
  }, { timeout: 300_000, maxWait: 30_000 });

  const apres = await compter(prisma);
  const ecarts = ordre.filter((t) => apres[t] !== contenu.comptes[t]);
  if (ecarts.length) {
    console.error("\nÉCART après restauration :", ecarts.map((t) => `${t} ${apres[t]} au lieu de ${contenu.comptes[t]}`).join(", "));
    process.exit(4);
  }
  console.log(`\nRestauration terminée et vérifiée : ${ordre.reduce((n, t) => n + apres[t], 0)} lignes dans ${ordre.length} tables.`);
} finally {
  await prisma.$disconnect();
}
