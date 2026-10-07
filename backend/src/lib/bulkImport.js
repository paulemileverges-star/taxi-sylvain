import ExcelJS from "exceljs";

// Analyse un fichier .xlsx ou .csv uploadé (liste de clients ou de chauffeurs, besoin #2) et le
// convertit en tableau d'objets { colonneNormalisée: valeur }. La normalisation des en-têtes
// (minuscule, sans accents, sans espaces superflus) permet d'accepter "Nom", "nom", "Telephone",
// "téléphone" etc. sans exiger un format exact — les gens qui préparent ces fichiers ne sont pas
// développeurs. Chaque ligne porte aussi son numéro dans le fichier (_ligne), pour que la console
// dise quelle ligne corriger.
export function normalizeHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents (combining diacritical marks)
    .replace(/\s+/g, " ");
}

/**
 * Texte d'un fichier CSV : UTF-8 (avec ou sans BOM), sinon Windows-1252, l'encodage d'un CSV
 * enregistré par Excel en français (« Mémo » y devenait illisible).
 */
export function texteDuCsv(buffer) {
  let texte;
  try {
    texte = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    texte = new TextDecoder("windows-1252").decode(buffer);
  }
  return texte.replace(/^﻿/, "");
}

/** Séparateur le plus fréquent dans la ligne d'en-têtes, hors guillemets : « ; », « , » ou tabulation. */
export function separateurDuCsv(texte) {
  const compte = { ",": 0, ";": 0, "\t": 0 };
  let guillemets = false;
  for (const c of texte) {
    if (c === '"') guillemets = !guillemets;
    else if (!guillemets && (c === "\n" || c === "\r")) break;
    else if (!guillemets && c in compte) compte[c] += 1;
  }
  const [meilleur, nombre] = Object.entries(compte).sort((a, b) => b[1] - a[1])[0];
  return nombre > 0 ? meilleur : ",";
}

/**
 * Découpe un CSV entier en lignes de cellules, guillemets compris : un champ entre guillemets peut
 * contenir le séparateur, un retour à la ligne ou un guillemet doublé (""). Audit du 7 octobre 2026
 * (B11) : le texte était coupé en lignes AVANT de lire les guillemets (un mémo sur deux lignes
 * devenait deux clients) et seul « , » était reconnu (un CSV d'Excel en français utilise « ; »).
 */
export function decouperCsv(texte, separateur = separateurDuCsv(texte)) {
  const lignes = [];
  let cellules = [];
  let cellule = "";
  let guillemets = false;
  let numero = 1;
  let debutLigne = 1;
  const finirLigne = () => {
    cellules.push(cellule);
    if (cellules.some((c) => c.trim() !== "")) lignes.push({ numero: debutLigne, cellules: cellules.map((c) => c.trim()) });
    cellules = [];
    cellule = "";
  };
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') { cellule += '"'; i++; }
      else if (c === '"') guillemets = false;
      else {
        if (c === "\n") numero += 1;
        cellule += c;
      }
    } else if (c === '"') guillemets = true;
    else if (c === separateur) { cellules.push(cellule); cellule = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      finirLigne();
      numero += 1;
      debutLigne = numero;
    } else cellule += c;
  }
  if (cellule !== "" || cellules.length) finirLigne();
  return lignes;
}

export function parseCsv(texte) {
  const lignes = decouperCsv(texte);
  if (lignes.length === 0) return [];
  const headers = lignes[0].cellules.map(normalizeHeader);
  return lignes.slice(1).map(({ numero, cellules }) => {
    const row = { _ligne: numero };
    headers.forEach((h, i) => { if (h) row[h] = cellules[i] ?? ""; });
    return row;
  });
}

/** Valeur lisible d'une cellule Excel : texte enrichi, lien, formule ou date compris. */
export function valeurCellule(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text || "").join("").trim();
    if (v.text !== undefined) return valeurCellule(v.text);
    if (v.result !== undefined) return valeurCellule(v.result);
    if (v.hyperlink) return String(v.hyperlink).replace(/^mailto:/i, "").trim();
    return "";
  }
  return String(v).trim();
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
      headers = values.map((v) => normalizeHeader(valeurCellule(v)));
      return;
    }
    const obj = { _ligne: rowNumber };
    headers.forEach((h, i) => { if (h) obj[h] = valeurCellule(values[i]); });
    if (Object.entries(obj).some(([k, v]) => k !== "_ligne" && v !== "")) rows.push(obj);
  });
  return rows;
}

export async function parseImportFile(file) {
  const isXlsx = /\.xlsx$/i.test(file.originalname || "") || String(file.mimetype || "").includes("spreadsheet");
  if (isXlsx) return parseXlsx(file.buffer);
  return parseCsv(texteDuCsv(file.buffer));
}

// Cherche la première colonne présente parmi plusieurs alias possibles pour un même champ. Les alias
// sont normalisés comme les en-têtes : « mémo et préférences » trouve la colonne « Mémo et préférences »
// (avant le 7 octobre 2026, un alias accentué ne trouvait jamais rien).
export function pick(row, ...aliases) {
  for (const alias of aliases) {
    const cle = normalizeHeader(alias);
    if (row[cle] !== undefined && row[cle] !== "") return row[cle];
  }
  return "";
}
