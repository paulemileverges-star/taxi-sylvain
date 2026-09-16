import { prisma } from "./prisma.js";

// Catalogue des prix Taxi Sylvain (transmis le 2026-09-16) : municipalité de prise en charge ->
// tarif vers YUL / YHU. Créé au premier démarrage ; ensuite le Dispatch le modifie depuis la page
// Tarifs (les modifications ne sont jamais écrasées par ce fichier).
const ZONES = [
  ["Acton Vale", 180, 140], ["Ange-Gardien", 125, 85], ["Austin", 210, 175],
  ["Beaulac-Garthby", 375, 320], ["Bedford", 150, 115], ["Beloeil", 85, 50],
  ["Boucherville", 70, 40], ["Bromont", 165, 135], ["Bromptonville", 255, 205], ["Brossard", 65, 40], ["Burlington", 270, 240],
  ["Candiac", 65, 40], ["Carignan", 75, 45], ["Chambly", 85, 50], ["Contrecoeur", 125, 85], ["Cornwall", 165, 125],
  ["Cowansville", 160, 140], ["Clarenceville", 160, 125],
  ["Danville", 270, 240], ["Delson", 65, 40], ["Drummondville", 215, 165], ["Dunham", 165, 130],
  ["East Farnham", 145, 105], ["Eastman", 205, 170],
  ["Farnham", 130, 110],
  ["Gatineau", 310, 350], ["Granby", 150, 110],
  ["Hemmingford", 125, 90], ["Henryville", 125, 90], ["Hinchinbrooke", 135, 100], ["Huntingdon", 145, 165],
  ["Iberville", 95, 50],
  ["Joliette", 170, 165],
  ["Kingsey Falls", 280, 250], ["Knowlton", 200, 155],
  ["L'Acadie", 80, 60], ["Lacolle", 110, 105], ["La Prairie", 65, 40], ["La Présentation", 140, 100],
  ["Lac-Brome", 200, 155], ["L'Île-aux-Noix", 110, 70], ["Longueuil", 65, 35],
  ["Magog", 230, 190], ["Marieville", 105, 55], ["McMasterville", 85, 40],
  ["Mont-Saint-Grégoire", 120, 55], ["Mont-Saint-Hilaire", 95, 55],
  ["Napierville", 110, 75],
  ["Orford", 230, 170], ["Otterburn Park", 105, 55], ["Ottawa", 320, 360],
  ["Pike River", 140, 80], ["Philipsburg", 165, 130], ["Plattsburgh", 170, 130],
  ["Québec", 455, 395],
  ["Racine", 230, 190], ["Repentigny", 115, 105], ["Richelieu", 90, 60], ["Richmond", 270, 215],
  ["Roxton Falls", 190, 140], ["Roxton Pond", 175, 125],
  ["Sainte-Anne-de-Sabrevois", 110, 75], ["Saint-Amable", 100, 50], ["Saint-Anicet", 150, 205],
  ["Saint-Antoine-sur-Richelieu", 120, 70], ["Saint-Armand", 155, 135], ["Saint-Athanase", 100, 60],
  ["Saint-Basile-le-Grand", 80, 40], ["Saint-Bernard-de-Lacolle", 110, 85], ["Saint-Bruno-de-Montarville", 80, 35],
  ["Sainte-Cécile-de-Milton", 145, 105], ["Saint-Césaire", 120, 75], ["Saint-David-d'Yamaska", 190, 140],
  ["Saint-Damase", 125, 85], ["Saint-Denis-sur-Richelieu", 130, 85], ["Saint-Dominique", 140, 100],
  ["Saint-Étienne-de-Bolton", 185, 145], ["Saint-Hilaire", 95, 55], ["Saint-Hubert", 70, 35],
  ["Saint-Léonard-d'Aston", 240, 205], ["Saint-Ignace-de-Stanbridge", 150, 115], ["Saint-Jacques-le-Mineur", 95, 45],
  ["Saint-Jean", 95, 60], ["Saint-Jean-Baptiste", 100, 60], ["Saint-Jean-sur-Richelieu", 95, 60],
  ["Saint-Lambert", 65, 35], ["Saint-Marc-sur-Richelieu", 130, 85], ["Saint-Mathias-sur-Richelieu", 95, 65],
  ["Saint-Mathieu-de-Beloeil", 85, 50], ["Saint-Paul-d'Abbotsford", 130, 85], ["Saint-Pie", 150, 100],
  ["Saint-Roch-de-Richelieu", 135, 90], ["Saint-Ours", 150, 95], ["Saint-Valérien-de-Milton", 160, 120],
  ["Sainte-Clotilde", 85, 70], ["Saint-Hyacinthe", 135, 80], ["Sainte-Julie", 85, 45], ["Sainte-Madeleine", 115, 75],
  ["Sainte-Sabine", 130, 105], ["Salaberry-de-Valleyfield", 115, 135], ["Shefford", 190, 160],
  ["Sherbrooke", 285, 235], ["Sorel-Tracy", 160, 120], ["Sutton", 205, 185],
  ["Trois-Rivières", 290, null], ["Val-Maher", 185, 160], ["Val-Shefford", 205, 170], ["Varennes", 85, 55],
  ["Venise-en-Québec", 175, 125], ["Verchères", 110, 75], ["Victoriaville", 290, null],
  ["Warwick", 295, 255], ["Waterloo", 185, 155], ["West Brome", 175, 145],
  ["Yamaska", 155, 115],
];

export async function ensureDefaultPriceZones() {
  const existing = await prisma.priceZone.count();
  if (existing > 0) return;
  await prisma.priceZone.createMany({
    data: ZONES.map(([name, priceYUL, priceYHU], i) => ({ name, priceYUL, priceYHU, sortOrder: i + 1 })),
    skipDuplicates: true,
  });
}
