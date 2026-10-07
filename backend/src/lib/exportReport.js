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

// Tableau PDF commun aux récaps et aux listes (audit du 7 octobre 2026, B06). Avant : des colonnes
// plus larges que la page (prix et notes coupés), la hauteur d'une ligne prise sur la dernière
// cellule (une adresse longue chevauchait les lignes suivantes), une ligne coupée entre deux pages et
// des pages sans en-têtes. Désormais :
//   - les largeurs données sont des proportions, ramenées à la largeur utile de la page ;
//   - la hauteur d'une ligne est celle de sa cellule la plus haute ;
//   - une ligne qui ne tient plus passe entière à la page suivante, où les en-têtes sont répétés.
const MARGE = 40;
export function largeursAjustees(colonnes, largeurUtile) {
  const total = colonnes.reduce((s, c) => s + c.largeur, 0) || 1;
  return colonnes.map((c) => (c.largeur * largeurUtile) / total);
}

export function tableauPdf(doc, { colonnes, lignes, texte, taille = 9, titreSuite = null }) {
  const gauche = MARGE;
  const largeurUtile = doc.page.width - 2 * MARGE;
  const largeurs = largeursAjustees(colonnes, largeurUtile);
  const bas = () => doc.page.height - MARGE - 10;
  const trait = () => doc.moveTo(gauche, doc.y).lineTo(gauche + largeurUtile, doc.y).strokeColor("#cccccc").stroke();
  const hauteurDe = (valeurs, police) => {
    doc.font(police).fontSize(taille);
    return Math.max(...valeurs.map((v, i) => doc.heightOfString(v, { width: largeurs[i] - 4 })));
  };
  const ecrire = (valeurs, police, couleur) => {
    const y = doc.y;
    const h = hauteurDe(valeurs, police);
    doc.fillColor(couleur);
    let x = gauche;
    valeurs.forEach((v, i) => { doc.text(v, x, y, { width: largeurs[i] - 4, lineBreak: true }); x += largeurs[i]; });
    doc.x = gauche;
    doc.y = y + h + 3;
  };
  const titres = colonnes.map((c) => c.titre);
  const entete = () => { ecrire(titres, "Helvetica-Bold", "#555555"); trait(); doc.y += 2; };

  entete();
  for (const ligne of lignes) {
    const valeurs = colonnes.map((c) => texte(ligne, c));
    if (doc.y + hauteurDe(valeurs, "Helvetica") > bas()) {
      doc.addPage({ margin: MARGE, layout: "landscape" });
      if (titreSuite) doc.font("Helvetica-Bold").fontSize(11).fillColor("#000").text(titreSuite, gauche).moveDown(0.3);
      entete();
    }
    ecrire(valeurs, "Helvetica", "#000000");
  }
  trait();
  doc.font("Helvetica");
}

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
  const basDePage = () => doc.page.height - 50;

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
    tableauPdf(doc, {
      colonnes: COLONNES_RECAP,
      lignes: bloc.courses,
      texte: (ligne, c) => texteCellule(ligne, c.cle),
      titreSuite: `${bloc.titre} (suite)`,
    });
    doc.moveDown(0.3);
    if (doc.y > basDePage() - 30) doc.addPage({ margin: 40, layout: "landscape" });
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

  // Beaucoup de colonnes (la liste des clients en a dix) : police plus petite pour rester lisible.
  tableauPdf(doc, {
    colonnes: columns.map((c) => ({ cle: c.key, titre: c.label, largeur: c.width })),
    lignes: rows,
    texte: (row, c) => String(row[c.cle] ?? "") || "—",
    taille: columns.length > 8 ? 7.5 : 9,
    titreSuite: `${title} (suite)`,
  });

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
