import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { jourQuebec } from "./semaines.js";

// Dates des listes (chauffeurs, clients) : date civile du Québec, jamais celle du serveur (UTC).
function fmtDate(d) {
  return jourQuebec(d);
}
function fmtMoney(n) {
  return `${Number(n || 0).toFixed(2)} $`;
}

// Colonnes du détail d'un récap, comme le tableau tenu par Taxi Sylvain (date, client, ville,
// montant), complétées de l'heure, de la destination et du statut. Largeurs pour une page paysage.
const COLONNES_RECAP = [
  { cle: "date", titre: "Date", largeur: 62 },
  { cle: "heure", titre: "Heure", largeur: 38 },
  { cle: "client", titre: "Client", largeur: 120 },
  { cle: "ville", titre: "Ville (départ)", largeur: 105 },
  { cle: "destination", titre: "Destination", largeur: 215 },
  { cle: "montant", titre: "Montant", largeur: 62 },
  { cle: "statutLibelle", titre: "Statut", largeur: 110 },
];

function blocsDuRapport(rapport, avecNonAssignees) {
  const blocs = rapport.chauffeurs.map((b) => ({ titre: b.chauffeur.name, ...b }));
  if (avecNonAssignees && rapport.nonAssignees.courses.length) blocs.push({ titre: "Courses sans chauffeur", ...rapport.nonAssignees });
  return blocs;
}

function texteCellule(ligne, cle) {
  if (cle === "montant") return fmtMoney(ligne.montant);
  if (cle === "destination") return ligne.arrets?.length ? `${ligne.destination} (via ${ligne.arrets.length} arrêt${ligne.arrets.length > 1 ? "s" : ""})` : ligne.destination;
  return String(ligne[cle] ?? "—") || "—";
}

/** Récap PDF d'une période : un bloc par chauffeur, une ligne par course, sous-totaux et redevance. */
export function streamReportPdf(res, { weekStart, weekEnd, rapport, avecNonAssignees = true }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="recap-${fmtDate(weekStart)}.pdf"`);

  const doc = new PDFDocument({ margin: 40, layout: "landscape" });
  doc.pipe(res);
  const gauche = 40;
  const droite = gauche + COLONNES_RECAP.reduce((s, c) => s + c.largeur, 0);
  const basDePage = () => doc.page.height - 50;
  const ligneGrise = () => { doc.moveTo(gauche, doc.y).lineTo(droite, doc.y).strokeColor("#cccccc").stroke(); };

  doc.fontSize(18).fillColor("#000").text("Taxi Sylvain — Récapitulatif des courses", gauche);
  doc.moveDown(0.2);
  doc.fontSize(11).fillColor("#555").text(`Du ${fmtDate(weekStart)} au ${fmtDate(weekEnd)} (date de la course, heure du Québec)`, gauche);
  doc.moveDown(0.8);

  const blocs = blocsDuRapport(rapport, avecNonAssignees);
  if (!blocs.length) doc.fontSize(11).fillColor("#000").text("Aucune course sur cette période.", gauche);

  for (const bloc of blocs) {
    if (doc.y > basDePage() - 80) doc.addPage({ margin: 40, layout: "landscape" });
    doc.fontSize(13).fillColor("#000").text(bloc.titre, gauche);
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#555");
    let x = gauche;
    const yTitre = doc.y;
    for (const c of COLONNES_RECAP) { doc.text(c.titre, x, yTitre, { width: c.largeur - 4 }); x += c.largeur; }
    doc.moveDown(0.3);
    ligneGrise();
    doc.moveDown(0.2);
    doc.fillColor("#000");
    for (const ligne of bloc.courses) {
      if (doc.y > basDePage()) doc.addPage({ margin: 40, layout: "landscape" });
      const y = doc.y;
      let hauteur = 0;
      x = gauche;
      for (const c of COLONNES_RECAP) {
        const texte = texteCellule(ligne, c.cle);
        doc.text(texte, x, y, { width: c.largeur - 4 });
        hauteur = Math.max(hauteur, doc.heightOfString(texte, { width: c.largeur - 4 }));
        x += c.largeur;
      }
      doc.y = y + hauteur + 3;
    }
    ligneGrise();
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#000").text(
      `Effectuées : ${bloc.effectuees.nombre} course${bloc.effectuees.nombre > 1 ? "s" : ""} · total ${fmtMoney(bloc.effectuees.montant)} · redevance à payer ${fmtMoney(bloc.effectuees.redevance)}` +
      (bloc.aEffectuer.nombre ? `   |   À effectuer : ${bloc.aEffectuer.nombre} · ${fmtMoney(bloc.aEffectuer.montant)}` : ""),
      gauche
    );
    doc.moveDown(1);
  }

  if (blocs.length > 1) {
    const g = rapport.general;
    doc.fontSize(11).fillColor("#000").text(
      `Total général — effectuées : ${g.effectuees.nombre} · ${fmtMoney(g.effectuees.montant)} · redevances ${fmtMoney(g.effectuees.redevance)}` +
      (g.aEffectuer.nombre ? `   |   à effectuer : ${g.aEffectuer.nombre} · ${fmtMoney(g.aEffectuer.montant)}` : ""),
      gauche
    );
  }
  doc.end();
}

// Export générique d'une liste (chauffeurs, clients...) en PDF — colonnes: [{ key, label, width }]
export function streamListPdf(res, { title, filename, columns, rows }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);

  const doc = new PDFDocument({ margin: 40, layout: "landscape" });
  doc.pipe(res);

  doc.fontSize(18).text(title, { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor("#555").text(`${rows.length} entrée(s) — exporté le ${fmtDate(new Date())}`);
  doc.moveDown(1);

  const startX = 40;
  let colX = [];
  let x = startX;
  for (const col of columns) {
    colX.push(x);
    x += col.width;
  }

  const headerY = doc.y;
  doc.fontSize(10).fillColor("#000");
  columns.forEach((col, i) => doc.text(col.label, colX[i], headerY, { width: col.width }));
  doc.moveDown(0.5);
  doc.moveTo(startX, doc.y).lineTo(x, doc.y).strokeColor("#ccc").stroke();
  doc.moveDown(0.3);

  for (const row of rows) {
    const y = doc.y;
    columns.forEach((col, i) => doc.text(String(row[col.key] ?? "—"), colX[i], y, { width: col.width }));
    doc.moveDown(0.6);
    if (doc.y > 500) doc.addPage({ margin: 40, layout: "landscape" });
  }

  doc.end();
}

// Export générique d'une liste en Excel — colonnes: [{ key, label, width }]
export async function streamListXlsx(res, { title, filename, columns, rows }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title.slice(0, 31));

  const headerRow = sheet.addRow(columns.map((c) => c.label));
  headerRow.font = { bold: true };
  for (const row of rows) {
    sheet.addRow(columns.map((c) => row[c.key] ?? ""));
  }
  sheet.columns = columns.map((c) => ({ width: Math.max(12, Math.round(c.width / 6)) }));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

/** Récap Excel d'une période : mêmes blocs et mêmes chiffres que le PDF. */
export async function streamReportXlsx(res, { weekStart, weekEnd, rapport, avecNonAssignees = true }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Semaine ${fmtDate(weekStart)}`);

  sheet.mergeCells("A1:G1");
  sheet.getCell("A1").value = `Taxi Sylvain — Récapitulatif du ${fmtDate(weekStart)} au ${fmtDate(weekEnd)} (date de la course)`;
  sheet.getCell("A1").font = { bold: true, size: 13 };

  const blocs = blocsDuRapport(rapport, avecNonAssignees);
  for (const bloc of blocs) {
    sheet.addRow([]);
    sheet.addRow([bloc.titre]).font = { bold: true, size: 12 };
    sheet.addRow(["Date", "Heure", "Client", "Ville (départ)", "Destination", "Montant ($)", "Statut"]).font = { bold: true };
    for (const l of bloc.courses) {
      sheet.addRow([l.date, l.heure, l.client || "", l.ville || "", texteCellule(l, "destination"), l.montant, l.statutLibelle]);
    }
    sheet.addRow(["", "", "", "", "Total des courses effectuées", bloc.effectuees.montant, `${bloc.effectuees.nombre} course(s)`]).font = { bold: true };
    sheet.addRow(["", "", "", "", "Redevance à payer", bloc.effectuees.redevance, ""]).font = { bold: true };
    if (bloc.aEffectuer.nombre) sheet.addRow(["", "", "", "", "À effectuer", bloc.aEffectuer.montant, `${bloc.aEffectuer.nombre} course(s)`]);
  }
  if (!blocs.length) sheet.addRow(["Aucune course sur cette période."]);

  sheet.columns = [{ width: 12 }, { width: 8 }, { width: 24 }, { width: 20 }, { width: 46 }, { width: 13 }, { width: 14 }];
  sheet.getColumn(6).numFmt = "0.00";

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="recap-${fmtDate(weekStart)}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}
