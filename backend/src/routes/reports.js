import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, requirePermission } from "../middleware/auth.js";
import { generateWeeklyReports } from "../jobs/weeklyReport.js";
import { previousWeekRange, mondayOf, semaineDe } from "../lib/semaines.js";
import { filtrePeriode, rapportPeriode, recapsHebdomadaires, totaux, ligneCourse, STATUT_EFFECTUEE, STATUTS_ANNULES } from "../lib/rapports.js";
import { streamReportPdf, streamReportXlsx } from "../lib/exportReport.js";

// Rapports : une seule règle de calcul pour tous les écrans et exports (lib/rapports.js, 6 octobre
// 2026) : une course compte à la date de la course (heure du Québec), dans les montants quand elle
// est effectuée ; les chiffres sont recalculés à chaque lecture.
const router = Router();

// Accepte le token soit dans l'en-tête Authorization, soit en query (?token=...) — nécessaire
// pour un lien de téléchargement direct (ex. ouvert depuis l'app Chauffeur via Linking.openURL).
function authFromHeaderOrQuery(req, res, next) {
  // Même contrôle que partout ailleurs (compte encore existant, rôle à jour) : le jeton passé dans
  // l'adresse est simplement recopié dans l'en-tête avant l'appel à requireAuth.
  if (!req.headers.authorization && typeof req.query.token === "string") {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  return requireAuth(req, res, next);
}

router.use((req, res, next) => (req.path === "/export" ? authFromHeaderOrQuery(req, res, next) : requireAuth(req, res, next)));

/** Période demandée (from, to en ISO), sinon la semaine en cours. Null si une date est illisible. */
function periode(query, parDefaut = () => semaineDe(new Date())) {
  const { from, to } = query;
  if (!from || !to) {
    const s = parDefaut();
    return { from: s.weekStart, to: s.weekEnd };
  }
  const debut = new Date(from);
  const fin = new Date(to);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || fin < debut) return null;
  return { from: debut, to: fin };
}

const INCLUDE_RAPPORT = {
  driver: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
};

// Rapport d'une période pour le Dispatch (page Rapports) : toutes les courses de la période,
// classées par chauffeur, effectuées et à effectuer, avec les totaux ; plus le récap par client.
router.get("/periode", requirePermission("reports"), async (req, res) => {
  const p = periode(req.query);
  if (!p) return res.status(400).json({ error: "Période invalide." });
  const rides = await prisma.ride.findMany({ where: filtrePeriode(p.from, p.to), include: INCLUDE_RAPPORT });
  const rapport = rapportPeriode(rides);

  // Récap par client (cahier des charges : « par chauffeur ou encore par client »), courses effectuées.
  const parClient = new Map();
  for (const ride of rides) {
    if (ride.status !== STATUT_EFFECTUEE) continue;
    const cle = ride.clientId || "__aucun__";
    if (!parClient.has(cle)) parClient.set(cle, { client: ride.client || { id: null, name: "Client non spécifié" }, lignes: [] });
    parClient.get(cle).lignes.push(ligneCourse(ride));
  }
  const clients = [...parClient.values()]
    .map((c) => ({ client: c.client, ...totaux(c.lignes).effectuees }))
    .sort((a, b) => b.montant - a.montant);

  res.json({ from: p.from, to: p.to, ...rapport, clients });
});

// Ancienne vue (console d'avant le 6 octobre 2026) : même règle de calcul, ancien format.
router.get("/weekly", requirePermission("reports"), async (req, res) => {
  const p = periode(req.query, () => previousWeekRange());
  if (!p) return res.status(400).json({ error: "Période invalide." });
  const rides = await prisma.ride.findMany({ where: { status: STATUT_EFFECTUEE, ...filtrePeriode(p.from, p.to) }, include: INCLUDE_RAPPORT });
  const r = rapportPeriode(rides);
  res.json({
    range: { gte: p.from, lte: p.to },
    byDriver: r.chauffeurs.map((b) => ({ driver: b.chauffeur, rideCount: b.effectuees.nombre, totalFare: b.effectuees.montant, royaltyDue: b.effectuees.redevance })),
    byClient: [],
  });
});

// Revenus de la semaine en cours pour le chauffeur connecté — « Mes revenus ». Courses effectuées
// dont la date tombe dans la semaine en cours (heure du Québec).
router.get("/my-earnings", requireRole("DRIVER"), async (req, res) => {
  const { weekStart, weekEnd } = semaineDe(new Date());
  const rides = await prisma.ride.findMany({ where: { driverId: req.user.id, status: STATUT_EFFECTUEE, ...filtrePeriode(weekStart, weekEnd) } });
  const t = totaux(rides.map(ligneCourse)).effectuees;
  res.json({ weekStart, rideCount: t.nombre, totalFare: t.montant, royaltyDue: t.redevance });
});

// « Mes rapports » du chauffeur connecté : une ligne par semaine terminée où il a des courses
// effectuées, recalculée à chaque ouverture (même forme qu'avant : les applications installées la
// lisent telle quelle).
router.get("/mine", requireRole("DRIVER"), async (req, res) => {
  const [rides, figes] = await Promise.all([
    prisma.ride.findMany({ where: { driverId: req.user.id, status: STATUT_EFFECTUEE }, select: { id: true, status: true, fare: true, royaltyRate: true, scheduledFor: true, createdAt: true } }),
    prisma.weeklyReport.findMany({ where: { driverId: req.user.id }, select: { id: true, weekStart: true, createdAt: true } }),
  ]);
  const ids = new Map(figes.map((f) => [new Date(f.weekStart).toISOString(), f]));
  const recaps = recapsHebdomadaires(rides, { avant: mondayOf(new Date()) }).map((r) => {
    const fige = ids.get(r.weekStart.toISOString());
    return { id: fige?.id || `semaine-${r.weekStart.toISOString()}`, driverId: req.user.id, ...r, createdAt: fige?.createdAt || r.weekEnd };
  });
  res.json(recaps);
});

// Recalcule le récap de la semaine dernière (normalement automatique le lundi à 04 h 00, voir
// index.js). Silencieux : aucune notification ni courriel, pour ne plus inonder les chauffeurs.
router.post("/generate", requirePermission("reports"), async (req, res) => {
  const { from, to } = req.body;
  const range = from && to ? { weekStart: new Date(from), weekEnd: new Date(to) } : previousWeekRange();
  const results = await generateWeeklyReports(req.app.get("io"), range);
  res.status(201).json({ range, count: results.length });
});

// Export PDF/Excel — Dispatch (tous les chauffeurs) ou Chauffeur (le sien uniquement), avec le
// détail course par course. Sans période : la semaine dernière.
router.get("/export", async (req, res) => {
  if (req.user.role === "CLIENT") return res.status(403).json({ error: "Accès refusé." });
  if (req.user.role === "ADMIN" && !req.user.permissions?.includes("reports")) {
    return res.status(403).json({ error: "Accès refusé : cette fonctionnalité n'est pas autorisée pour votre compte." });
  }
  const format = req.query.format === "xlsx" ? "xlsx" : "pdf";
  const p = periode(req.query, () => previousWeekRange());
  if (!p) return res.status(400).json({ error: "Période invalide." });

  const where = {
    ...filtrePeriode(p.from, p.to),
    status: { notIn: STATUTS_ANNULES },
    ...(req.user.role === "DRIVER" ? { driverId: req.user.id } : {}),
  };
  const rides = await prisma.ride.findMany({ where, include: INCLUDE_RAPPORT });
  const rapport = rapportPeriode(rides);
  // Le chauffeur ne voit que son propre bloc ; le Dispatch voit aussi les courses sans chauffeur.
  const options = { weekStart: p.from, weekEnd: p.to, rapport, avecNonAssignees: req.user.role !== "DRIVER" };
  if (format === "xlsx") await streamReportXlsx(res, options);
  else streamReportPdf(res, options);
});

export default router;
