// Forme unique des adresses (demande du propriétaire du 20 septembre 2026) :
// « numéro + rue, ville, province + code postal », partout pareil, et reconnaissable par Waze.
// Règle de sécurité : une mise en forme ne doit JAMAIS changer la municipalité reconnue, car
// c'est elle qui fixe le prix de la course.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";

const { formatFromNominatim, cleanAddressText, canonicalAddress, codeProvince, uniteDeLAdresse, buildGeocodeParams } =
  await import("../src/lib/addressFormat.js");

const ZONES = [
  { name: "Chambly", priceYUL: 85 },
  { name: "Brossard", priceYUL: 65 },
  { name: "Québec", priceYUL: 455 },
  { name: "Plattsburgh", priceYUL: 170 },
];

const osm = (address, extra = {}) => ({ address, ...extra });

test("une adresse civique devient « numéro rue, ville, QC code postal »", () => {
  const r = osm({ house_number: "1580", road: "Avenue Bourgogne", city: "Chambly", state: "Québec", postcode: "J3L 2Y7", country_code: "ca" });
  assert.equal(formatFromNominatim(r, "1580 avenue bourgogne chambly"), "1580 Avenue Bourgogne, Chambly, QC J3L 2Y7");
});

test("le nom du lieu ne passe jamais devant une adresse civique", () => {
  // « Brossard, 1580 Avenue Bourgogne, Chambly » ferait facturer Brossard au lieu de Chambly.
  const r = osm({ house_number: "1580", road: "Avenue Bourgogne", city: "Chambly", state: "Québec", postcode: "J3L 2Y7", country_code: "ca" }, { name: "Brossard" });
  const forme = formatFromNominatim(r, "1580 avenue bourgogne");
  assert.ok(!forme.startsWith("Brossard"), forme);
  assert.equal(forme, "1580 Avenue Bourgogne, Chambly, QC J3L 2Y7");
});

test("un lieu sans numéro civique garde son nom (station, aéroport)", () => {
  const r = osm({ road: "Boulevard de Rome", city: "Brossard", state: "Québec", postcode: "J4X 2A4", country_code: "ca" }, { name: "Station du REM" });
  assert.equal(formatFromNominatim(r, "boulevard de rome brossard"), "Boulevard de Rome, Brossard, QC J4X 2A4");
  const sansRue = osm({ city: "Dorval", state: "Québec", postcode: "H4Y 1H1", country_code: "ca" }, { name: "Aéroport Montréal-Trudeau" });
  assert.equal(formatFromNominatim(sansRue, "aeroport"), "Aéroport Montréal-Trudeau, Dorval, QC H4Y 1H1");
});

test("le numéro tapé est conservé quand OpenStreetMap ne le connaît pas", () => {
  const r = osm({ road: "Rue Bourgogne", city: "Chambly", state: "Québec", postcode: "J3L 1Y8", country_code: "ca" });
  assert.equal(formatFromNominatim(r, "12 rue bourgogne chambly"), "12 Rue Bourgogne, Chambly, QC J3L 1Y8");
});

test("l'appartement tapé n'est plus perdu quand on clique une suggestion", () => {
  const r = osm({ house_number: "1580", road: "Avenue Bourgogne", city: "Chambly", state: "Québec", postcode: "J3L 2Y7", country_code: "ca" });
  assert.equal(formatFromNominatim(r, "1580 avenue Bourgogne app. 3, Chambly"), "1580 Avenue Bourgogne app. 3, Chambly, QC J3L 2Y7");
  assert.equal(uniteDeLAdresse("12 rue X suite 200"), "suite 200");
  assert.equal(uniteDeLAdresse("12 rue X #4"), "app. 4");
  assert.equal(uniteDeLAdresse("12 rue X, Chambly"), null);
});

test("la région n'est gardée que pour la ville de Québec, dont le tarif en dépend", () => {
  const quebec = osm({ house_number: "1037", road: "Rue de la Chevrotière", city: "Québec", county: "Agglomération de Québec", state: "Québec", postcode: "G1R 4Y3", country_code: "ca" });
  assert.match(formatFromNominatim(quebec, ""), /Québec, Agglomération de Québec, QC G1R 4Y3$/);
  const chambly = osm({ house_number: "12", road: "Rue Bourgogne", city: "Chambly", county: "La Vallée-du-Richelieu", state: "Québec", postcode: "J3L 1Y8", country_code: "ca" });
  assert.equal(formatFromNominatim(chambly, ""), "12 Rue Bourgogne, Chambly, QC J3L 1Y8");
});

test("une adresse américaine garde son pays, une adresse canadienne jamais", () => {
  const usa = osm({ house_number: "60", road: "Smithfield Blvd", city: "City of Plattsburgh", state: "New York", postcode: "12901", country_code: "us", country: "États-Unis" });
  assert.equal(formatFromNominatim(usa, ""), "60 Smithfield Blvd, Plattsburgh, NY 12901, États-Unis");
  const ca = osm({ house_number: "12", road: "Rue Bourgogne", city: "Chambly", state: "Québec", postcode: "J3L 1Y8", country_code: "ca", country: "Canada" });
  assert.ok(!formatFromNominatim(ca, "").includes("Canada"));
});

test("un élément manquant n'invente rien et ne laisse pas de trou", () => {
  assert.equal(formatFromNominatim(osm({ road: "Rue Bourgogne", city: "Chambly", state: "Québec", country_code: "ca" }), ""), "Rue Bourgogne, Chambly, QC");
  assert.equal(formatFromNominatim(osm({ house_number: "12", road: "Rue X", state: "Québec", postcode: "J3L 1Y8", country_code: "ca" }), ""), "12 Rue X, QC J3L 1Y8");
  assert.equal(formatFromNominatim(null, ""), null);
  assert.ok(!String(formatFromNominatim(osm({ road: "Rue X", city: "Chambly", country_code: "ca" }), "")).includes("null"));
});

test("la longue chaîne d'OpenStreetMap ne sert plus jamais de repli", () => {
  const r = { display_name: "Une très longue chaîne, quartier, MRC, région, Québec, Canada", address: { city: "Chambly", country_code: "ca" } };
  assert.equal(formatFromNominatim(r, ""), "Chambly");
});

test("le nettoyage d'une adresse déjà écrite enlève le pays, la MRC et abrège la province", () => {
  assert.equal(
    cleanAddressText("12 Rue Bourgogne, Chambly, La Vallée-du-Richelieu, Québec, J3L 1Y8, Canada"),
    "12 Rue Bourgogne, Chambly, QC J3L 1Y8"
  );
  assert.equal(cleanAddressText("12 Rue Bourgogne, Chambly, QC, J3L 1Y8"), "12 Rue Bourgogne, Chambly, QC J3L 1Y8");
});

test("le nettoyage ne touche pas à une adresse de la ville de Québec", () => {
  const avant = "1037 Rue de la Chevrotière, Québec, Agglomération de Québec, Québec, G1R 4Y3, Canada";
  const apres = cleanAddressText(avant);
  assert.match(apres, /Québec/);
  assert.match(apres, /Agglomération de Québec/, "sans sa région, la course Québec perdrait son tarif");
});

test("le nettoyage est stable : le repasser ne change plus rien", () => {
  const x = "12 Rue Bourgogne, Chambly, Québec, J3L 1Y8, Canada";
  const une = cleanAddressText(x);
  assert.equal(cleanAddressText(une), une);
});

test("une adresse vide reste vide, jamais une chaîne vide", () => {
  assert.equal(cleanAddressText(null), null);
  assert.equal(cleanAddressText(""), null);
  assert.equal(cleanAddressText("   "), null);
  assert.equal(cleanAddressText(", ,"), null);
});

test("GARDE-FOU : une mise en forme qui changerait la municipalité est refusée", () => {
  const texte = "1580 Avenue Bourgogne, Chambly, QC";
  const geocodeTrompeur = osm({ house_number: "1580", road: "Avenue Bourgogne", city: "Brossard", state: "Québec", postcode: "J4X 1A1", country_code: "ca" });
  const r = canonicalAddress({ texte, geocode: geocodeTrompeur, zones: ZONES });
  assert.equal(r.avertissement, "zone-differente");
  assert.equal(r.address, "1580 Avenue Bourgogne, Chambly, QC", "on garde le texte d'origine");
  assert.equal(r.zoneTexte, "Chambly");
  assert.equal(r.zoneForme, "Brossard");
});

test("quand la municipalité ne change pas, la forme propre est enregistrée", () => {
  const r = canonicalAddress({
    texte: "1580 avenue bourgogne chambly",
    geocode: osm({ house_number: "1580", road: "Avenue Bourgogne", city: "Chambly", state: "Québec", postcode: "J3L 2Y7", country_code: "ca" }),
    zones: ZONES,
  });
  assert.equal(r.address, "1580 Avenue Bourgogne, Chambly, QC J3L 2Y7");
  assert.equal(r.avertissement, null);
});

test("une adresse dont aucune municipalité n'est reconnue est acceptée, mais signalée", () => {
  const r = canonicalAddress({
    texte: "5 rue Inconnue, Villeperdue, QC",
    geocode: osm({ house_number: "5", road: "Rue Inconnue", city: "Villeperdue", state: "Québec", country_code: "ca" }),
    zones: ZONES,
  });
  assert.equal(r.avertissement, "ville-non-reconnue", "le tarif du catalogue ne s'appliquera pas");
  assert.equal(r.address, "5 Rue Inconnue, Villeperdue, QC");
});

test("sans résultat géocodé, on se contente de nettoyer le texte", () => {
  const r = canonicalAddress({ texte: "12 Rue Bourgogne, Chambly, Québec, Canada", zones: ZONES });
  assert.equal(r.address, "12 Rue Bourgogne, Chambly, QC");
});

test("les provinces et États utiles sont abrégés", () => {
  assert.equal(codeProvince("Québec"), "QC");
  assert.equal(codeProvince("Ontario"), "ON");
  assert.equal(codeProvince("New York"), "NY");
  assert.equal(codeProvince("Vermont"), "VT");
  assert.equal(codeProvince(null), null);
});

test("la recherche d'adresses accepte le Canada et les États-Unis", () => {
  const p = buildGeocodeParams({ q: "60 Smithfield Plattsburgh" });
  assert.equal(p.get("countrycodes"), "ca,us", "Plattsburgh et Burlington sont dans la grille tarifaire");
  assert.equal(p.get("addressdetails"), "1");
});

test("les abréviations sont écrites en toutes lettres avant d'interroger OpenStreetMap", async () => {
  const { expandAbbreviations } = await import("../src/lib/addressFormat.js");
  // Cas réel : « 975 Boul. Roméo-Vachon N » n'est pas trouvé, la forme longue l'est.
  assert.equal(expandAbbreviations("975 Boul. Roméo-Vachon N"), "975 Boulevard Roméo-Vachon Nord");
  assert.equal(expandAbbreviations("12 Av. des Érables"), "12 Avenue des Érables");
  assert.equal(expandAbbreviations("3 Ch. du Lac, St-Jean"), "3 Chemin du Lac, Saint-Jean");
  assert.equal(expandAbbreviations("Ste-Julie"), "Sainte-Julie");
});

test("le niveau de précision distingue une porte d'un arrêt d'autobus", async () => {
  const { confidenceFromOsm } = await import("../src/lib/addressFormat.js");
  assert.equal(confidenceFromOsm({ address: { house_number: "1580", road: "Avenue Bourgogne" }, category: "building" }), "porte");
  // Cas réel : « 975 Boulevard Roméo-Vachon Nord » tombe sur l'arrêt d'autobus des arrivées.
  assert.equal(confidenceFromOsm({ address: { house_number: "975", road: "Boulevard Roméo-Vachon Nord" }, category: "highway", type: "bus_stop" }), "rue");
  assert.equal(confidenceFromOsm({ address: { road: "Boulevard de Rome" }, name: "Station du REM", category: "public_transport" }), "lieu");
  assert.equal(confidenceFromOsm({ address: { road: "Rue X" }, category: "highway" }), "rue");
  assert.equal(confidenceFromOsm({ address: {}, category: "boundary" }), "approx");
  assert.equal(confidenceFromOsm(null), null);
});
