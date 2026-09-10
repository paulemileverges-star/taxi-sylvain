import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

function fmtDate(d) {
  return new Date(d).toLocaleDateString("fr-CA");
}
function fmtMoney(n) {
  return `${n.toFixed(2)} $`;
}

// rows: [{ driverName, rideCount, totalFare, royaltyDue }]
export function streamReportPdf(res, { weekStart, weekEnd, rows }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="recap-${fmtDate(weekStart)}.pdf"`);

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).text("Taxi Sylvain — Récapitulatif hebdomadaire", { align: "left" });
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor("#555").text(`Semaine du ${fmtDate(weekStart)} au ${fmtDate(weekEnd)}`);
  doc.moveDown(1);

  const colX = [40, 260, 340, 440];
  const headerY = doc.y;
  doc.fontSize(10).fillColor("#000");
  doc.text("Chauffeur", colX[0], headerY);
  doc.text("Courses", colX[1], headerY);
  doc.text("Montant total", colX[2], headerY);
  doc.text("Redevance due", colX[3], headerY);
  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#ccc").stroke();
  doc.moveDown(0.3);

  let totalFare = 0;
  let totalRoyalty = 0;
  for (const row of rows) {
    const y = doc.y;
    doc.text(row.driverName, colX[0], y, { width: 210 });
    doc.text(String(row.rideCount), colX[1], y);
    doc.text(fmtMoney(row.totalFare), colX[2], y);
    doc.text(fmtMoney(row.royaltyDue), colX[3], y);
    doc.moveDown(0.6);
    totalFare += row.totalFare;
    totalRoyalty += row.royaltyDue;
  }

  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#ccc").stroke();
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Total : ${fmtMoney(totalFare)}   —   Redevances dues : ${fmtMoney(totalRoyalty)}`, colX[0]);

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

export async function streamReportXlsx(res, { weekStart, weekEnd, rows }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Semaine ${fmtDate(weekStart)}`);

  sheet.mergeCells("A1:D1");
  sheet.getCell("A1").value = `Taxi Sylvain — Récapitulatif du ${fmtDate(weekStart)} au ${fmtDate(weekEnd)}`;
  sheet.getCell("A1").font = { bold: true, size: 13 };

  sheet.addRow([]);
  const headerRow = sheet.addRow(["Chauffeur", "Courses", "Montant total ($)", "Redevance due ($)"]);
  headerRow.font = { bold: true };

  for (const row of rows) {
    sheet.addRow([row.driverName, row.rideCount, row.totalFare, row.royaltyDue]);
  }

  const totalFare = rows.reduce((s, r) => s + r.totalFare, 0);
  const totalRoyalty = rows.reduce((s, r) => s + r.royaltyDue, 0);
  sheet.addRow([]);
  const totalRow = sheet.addRow(["Total", rows.reduce((s, r) => s + r.rideCount, 0), totalFare, totalRoyalty]);
  totalRow.font = { bold: true };

  sheet.columns = [{ width: 28 }, { width: 12 }, { width: 18 }, { width: 18 }];

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="recap-${fmtDate(weekStart)}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}
