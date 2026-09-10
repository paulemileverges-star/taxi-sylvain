import ExcelJS from "exceljs";

// Analyse un fichier .xlsx ou .csv uploadé (liste de clients ou de chauffeurs, besoin #2) et le
// convertit en tableau d'objets { colonneNormalisée: valeur }. La normalisation des en-têtes
// (minuscule, sans accents, sans espaces) permet d'accepter "Nom", "nom", "Telephone", "téléphone"
// etc. sans exiger un format exact — les gens qui préparent ces fichiers ne sont pas développeurs.
function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // retire les accents (combining diacritical marks)
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const splitLine = (line) => {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ",") { cells.push(cur); cur = ""; }
      else cur += c;
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };

  const headers = splitLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

async function parseXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  let headers = [];
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    const values = row.values.slice(1); // ExcelJS met un index 1-based, values[0] est vide
    if (rowNumber === 1) {
      headers = values.map(normalizeHeader);
      return;
    }
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] != null ? String(values[i]).trim() : ""; });
    rows.push(obj);
  });
  return rows;
}

export async function parseImportFile(file) {
  const isXlsx = /\.xlsx$/i.test(file.originalname) || file.mimetype.includes("spreadsheet");
  if (isXlsx) return parseXlsx(file.buffer);
  return parseCsv(file.buffer.toString("utf8"));
}

// Cherche la première colonne présente parmi plusieurs alias possibles pour un même champ.
export function pick(row, ...aliases) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== "") return row[alias];
  }
  return "";
}
