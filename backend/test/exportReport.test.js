// Exports du récap (PDF et Excel) : dates à l'heure du Québec et détail course par course
// (6 octobre 2026). Avant, la semaine du lundi 21 au dimanche 27 s'affichait « du 21 au 28 ».
import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import { streamReportXlsx, streamReportPdf } from "../src/lib/exportReport.js";
import { rapportPeriode } from "../src/lib/rapports.js";
import { semaineDe } from "../src/lib/semaines.js";

const q = (jourHeure) => new Date(`${jourHeure}:00-04:00`);
const YVES = { id: "chauffeuryves01", name: "Yves Christopher" };
const course = (id, quand, fare, status = "COMPLETED") => ({
  id, status, scheduledFor: q(quand), createdAt: q("2026-09-15T10:00"), fare, royaltyRate: 0.1, driverId: YVES.id, driver: YVES,
  client: { name: `Client ${id}` }, pickupAddress: "12 Rue Principale, Varennes, QC J3X 1A1", destAddress: "975 Boulevard Roméo-Vachon Nord (Arrivées), Dorval, QC H4Y 1H1", stops: [],
});

function fausseReponse() {
  const flux = new PassThrough();
  const morceaux = [];
  flux.on("data", (m) => morceaux.push(m));
  flux.entetes = {};
  flux.setHeader = (nom, valeur) => { flux.entetes[nom] = valeur; };
  flux.contenu = () => new Promise((resolve) => flux.on("end", () => resolve(Buffer.concat(morceaux))));
  return flux;
}

test("Excel : semaine du 21 au 27 (pas au 28), une ligne par course, totaux et redevance", async () => {
  const { weekStart, weekEnd } = semaineDe(q("2026-09-24T12:00"));
  const rapport = rapportPeriode([course("a", "2026-09-21T06:00", 90), course("b", "2026-09-27T22:30", 95), course("c", "2026-09-26T08:00", 120, "ACCEPTED")]);
  const res = fausseReponse();
  const fini = res.contenu();
  await streamReportXlsx(res, { weekStart, weekEnd, rapport, avecNonAssignees: false });
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(await fini);
  const feuille = classeur.worksheets[0];
  const textes = [];
  feuille.eachRow((ligne) => textes.push(ligne.values.filter((v) => v !== undefined && v !== null).join(" | ")));
  const tout = textes.join("\n");
  assert.match(tout, /du 2026-09-21 au 2026-09-27/);
  assert.match(tout, /2026-09-27 \| 22:30 \| Client b \| Varennes/);
  assert.match(tout, /Total des courses effectuées \| 185 \| 2 course\(s\)/);
  assert.match(tout, /Redevance à payer \| 18\.5/);
  assert.match(tout, /À effectuer \| 120 \| 1 course\(s\)/);
  assert.match(res.entetes["Content-Disposition"], /recap-2026-09-21\.xlsx/);
});

test("PDF : produit sans erreur, nommé d'après le lundi de la semaine (heure du Québec)", async () => {
  const { weekStart, weekEnd } = semaineDe(q("2026-09-24T12:00"));
  const res = fausseReponse();
  const fini = res.contenu();
  streamReportPdf(res, { weekStart, weekEnd, rapport: rapportPeriode([course("a", "2026-09-21T06:00", 90)]) });
  const pdf = await fini;
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.match(res.entetes["Content-Disposition"], /recap-2026-09-21\.pdf/);
});
