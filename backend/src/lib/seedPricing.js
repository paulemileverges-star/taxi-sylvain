import { prisma } from "./prisma.js";

// Grille tarifaire DÉFINITIVE de Taxi Sylvain (décision du propriétaire du 12 octobre 2026) : municipalité de
// prise en charge -> tarif vers YUL / YHU / REM, dans l'ordre de la page Tarifs. 161 municipalités, aucun prix
// manquant ; noms à l'orthographe officielle (la reconnaissance dans l'adresse en dépend : « Terbonne » ne
// reconnaissait pas Terrebonne). Elle n'est créée qu'au premier démarrage d'une base vide (préproduction,
// reconstruction) ; ensuite le Dispatch la modifie depuis la page Tarifs, et ce fichier n'écrase jamais rien.
// Catalogue d'origine transmis le 16 septembre 2026 ; les prix YHU et REM de Mansonville, Saint-Colomban,
// Sainte-Adèle, Sainte-Brigide-d'Iberville et Saint-Zotique ont été estimés par la distance en voiture et les
// villes voisines, puis validés par le propriétaire.
export const ZONES = [
  ["Acton Vale", 180, 155, 140], ["Ange-Gardien", 125, 100, 85], ["Austin", 210, 185, 170],
  ["Beaulac-Garthby", 375, 350, 335], ["Bedford", 150, 115, 110], ["Beloeil", 85, 50, 55],
  ["Boucherville", 70, 40, 60], ["Bromont", 165, 140, 125], ["Bromptonville", 255, 230, 215],
  ["Brossard", 65, 45, 30], ["Burlington", 270, 245, 230], ["Candiac", 65, 50, 40], ["Carignan", 75, 45, 35],
  ["Chambly", 85, 50, 40], ["Contrecoeur", 125, 80, 95], ["Cornwall", 165, 215, 200], ["Cowansville", 160, 135, 120],
  ["Clarenceville", 160, 135, 120], ["Danville", 270, 245, 230], ["Delson", 65, 40, 50],
  ["Drummondville", 215, 160, 175], ["Dunham", 165, 140, 125], ["East Farnham", 145, 120, 105],
  ["Eastman", 205, 175, 165], ["Farnham", 130, 105, 90], ["Gatineau", 310, 365, 350], ["Granby", 150, 125, 110],
  ["Hemmingford", 125, 110, 95], ["Henryville", 125, 110, 95], ["Hinchinbrooke", 135, 150, 135],
  ["Huntingdon", 145, 140, 125], ["Iberville", 95, 50, 65], ["Joliette", 170, 165, 170],
  ["Kingsey Falls", 280, 255, 240], ["Knowlton", 200, 175, 160], ["L'Acadie", 80, 75, 60], ["Lacolle", 110, 85, 75],
  ["La Prairie", 65, 60, 50], ["La Présentation", 140, 115, 100], ["Lac-Brome", 200, 175, 160],
  ["L'Île-aux-Noix", 110, 105, 90], ["Longueuil", 65, 35, 40], ["Magog", 230, 205, 190], ["Marieville", 105, 90, 75],
  ["McMasterville", 85, 40, 55], ["Mont-Saint-Grégoire", 120, 60, 75], ["Mont-Saint-Hilaire", 95, 55, 65],
  ["Napierville", 110, 85, 70], ["Orford", 230, 175, 190], ["Otterburn Park", 105, 55, 70],
  ["Ottawa", 320, 355, 340], ["Pike River", 140, 125, 110], ["Philipsburg", 165, 140, 125],
  ["Plattsburgh", 170, 165, 150], ["Québec", 455, 400, 415], ["Racine", 230, 205, 190],
  ["Repentigny", 115, 105, 120], ["Richelieu", 90, 60, 50], ["Richmond", 270, 215, 230],
  ["Roxton Falls", 190, 135, 150], ["Roxton Pond", 175, 150, 135], ["Sainte-Anne-de-Sabrevois", 110, 85, 70],
  ["Saint-Amable", 100, 50, 60], ["Saint-Anicet", 150, 115, 130], ["Saint-Antoine-sur-Richelieu", 120, 65, 80],
  ["Saint-Armand", 155, 130, 115], ["Saint-Athanase", 100, 85, 70], ["Saint-Basile-le-Grand", 80, 40, 50],
  ["Saint-Bernard-de-Lacolle", 125, 125, 110], ["Saint-Bruno-de-Montarville", 80, 35, 50],
  ["Sainte-Cécile-de-Milton", 145, 120, 105], ["Saint-Césaire", 120, 95, 80],
  ["Saint-David-d'Yamaska", 190, 135, 150], ["Saint-Damase", 125, 70, 85],
  ["Saint-Denis-sur-Richelieu", 130, 85, 100], ["Saint-Dominique", 140, 85, 100],
  ["Saint-Étienne-de-Bolton", 185, 160, 145], ["Saint-Hilaire", 95, 55, 65], ["Saint-Hubert", 70, 35, 40],
  ["Saint-Léonard-d'Aston", 240, 185, 200], ["Saint-Ignace-de-Stanbridge", 150, 115, 110],
  ["Saint-Jacques-le-Mineur", 95, 75, 60], ["Saint-Jean", 95, 75, 60], ["Saint-Jean-Baptiste", 100, 50, 65],
  ["Saint-Jean-sur-Richelieu", 95, 75, 60], ["Saint-Lambert", 65, 40, 40], ["Saint-Marc-sur-Richelieu", 130, 75, 90],
  ["Saint-Mathias-sur-Richelieu", 95, 50, 60], ["Saint-Mathieu-de-Beloeil", 85, 50, 60],
  ["Saint-Paul-d'Abbotsford", 130, 105, 90], ["Saint-Pie", 150, 95, 110], ["Saint-Roch-de-Richelieu", 135, 80, 95],
  ["Saint-Ours", 150, 100, 115], ["Saint-Valérien-de-Milton", 160, 105, 120], ["Sainte-Clotilde", 85, 95, 80],
  ["Saint-Hyacinthe", 135, 80, 95], ["Sainte-Julie", 85, 50, 60], ["Sainte-Madeleine", 115, 60, 75],
  ["Sainte-Sabine", 130, 105, 90], ["Salaberry-de-Valleyfield", 115, 145, 115], ["Shefford", 190, 165, 150],
  ["Sherbrooke", 285, 260, 245], ["Sorel-Tracy", 160, 120, 135], ["Sutton", 205, 180, 165],
  ["Trois-Rivières", 290, 245, 260], ["Val-Maher", 185, 130, 145], ["Val-Shefford", 205, 180, 165],
  ["Varennes", 85, 50, 60], ["Venise-en-Québec", 175, 150, 135], ["Verchères", 110, 60, 75],
  ["Victoriaville", 290, 265, 250], ["Warwick", 295, 270, 255], ["Waterloo", 185, 160, 145],
  ["West Brome", 175, 145, 130], ["Yamaska", 155, 100, 115], ["Saint-Lin", 115, 165, 155],
  ["Saint-Denis-de-Brompton", 260, 235, 220], ["Saint-Georges-de-Beauce", 515, 460, 475],
  ["Sainte-Angèle-de-Monnoir", 115, 90, 75], ["Saint-Isidore", 80, 65, 50], ["Vaudreuil", 60, 65, 80],
  ["Bolton-Ouest", 210, 185, 170], ["Chomedey", 65, 70, 85], ["Sainte-Dorothée", 60, 85, 70],
  ["Pont-Viau", 60, 65, 80], ["Duvernay", 60, 65, 80], ["Saint-Vincent-de-Paul", 65, 65, 80],
  ["Saint-François", 80, 75, 90], ["Vimont", 60, 65, 80], ["Auteuil", 65, 80, 95], ["Sainte-Rose", 60, 80, 65],
  ["Plessisville", 330, 275, 290], ["Stukely-Sud", 200, 155, 140], ["Sainte-Clotilde-de-Horton", 250, 225, 210],
  ["Sainte-Brigide-d'Iberville", 115, 90, 75], ["Sainte-Adèle", 150, 190, 175], ["Mont-Tremblant", 250, 290, 275],
  ["Sainte-Agathe-des-Monts", 195, 235, 220], ["Saint-Sauveur", 140, 180, 165], ["Lac-Supérieur", 250, 290, 275],
  ["Saint-Jérôme", 110, 150, 135], ["Prévost", 125, 165, 150], ["Morin-Heights", 150, 190, 175],
  ["Piedmont", 130, 170, 155], ["Sainte-Anne-des-Plaines", 95, 135, 120], ["Blainville", 70, 110, 95],
  ["Sainte-Thérèse", 65, 105, 90], ["Boisbriand", 50, 90, 75], ["Bois-des-Filion", 70, 110, 95],
  ["Rosemère", 65, 105, 90], ["Terrebonne", 80, 65, 80], ["Mascouche", 110, 90, 105],
  ["Deux-Montagnes", 55, 110, 95], ["Mirabel", 95, 140, 125], ["Saint-Eustache", 50, 105, 90],
  ["Sainte-Marthe-sur-le-Lac", 70, 115, 100], ["Windsor", 295, 270, 255], ["Saint-Zotique", 100, 160, 130],
  ["Mansonville", 255, 230, 215], ["Notre-Dame-du-Bon-Conseil", 240, 185, 200], ["Saint-Colomban", 120, 160, 145],
];

export async function ensureDefaultPriceZones() {
  const existing = await prisma.priceZone.count();
  if (existing > 0) return;
  await prisma.priceZone.createMany({
    data: ZONES.map(([name, priceYUL, priceYHU, priceREM], i) => ({ name, priceYUL, priceYHU, priceREM, sortOrder: i + 1 })),
    skipDuplicates: true,
  });
}
