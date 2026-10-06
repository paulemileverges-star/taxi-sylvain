// Adresses par Google Maps (demande du propriétaire du 6 octobre 2026, lib/googleMaps.js). Les
// réponses simulées suivent le format documenté des API Places (New) et Geocoding de Google.
import test from "node:test";
import assert from "node:assert/strict";
import { formeDepuisGoogle, precisionGoogle, suggestions, detailsLieu, geocoderGoogle, googleActif } from "../src/lib/googleMaps.js";
import { matchZone } from "../src/lib/pricing.js";

const COMPOSANTS_PLACES = [
  { longText: "1580", shortText: "1580", types: ["street_number"] },
  { longText: "Avenue Bourgogne", shortText: "Av. Bourgogne", types: ["route"] },
  { longText: "Chambly", shortText: "Chambly", types: ["locality", "political"] },
  { longText: "La Vallée-du-Richelieu", shortText: "La Vallée-du-Richelieu", types: ["administrative_area_level_2", "political"] },
  { longText: "Québec", shortText: "QC", types: ["administrative_area_level_1", "political"] },
  { longText: "Canada", shortText: "CA", types: ["country", "political"] },
  { longText: "J3L 2Y7", shortText: "J3L 2Y7", types: ["postal_code"] },
];
const COMPOSANTS_GEOCODING = COMPOSANTS_PLACES.map((c) => ({ long_name: c.longText, short_name: c.shortText, types: c.types }));

const reponse = (corps, ok = true) => async () => ({ ok, status: ok ? 200 : 403, json: async () => corps });

test("l'adresse Google est remise à la forme unique de Taxi Sylvain (rue en toutes lettres)", () => {
  assert.equal(formeDepuisGoogle(COMPOSANTS_PLACES), "1580 Avenue Bourgogne, Chambly, QC J3L 2Y7");
  assert.equal(formeDepuisGoogle(COMPOSANTS_GEOCODING), "1580 Avenue Bourgogne, Chambly, QC J3L 2Y7", "même résultat avec l'API Geocoding");
  assert.equal(formeDepuisGoogle(COMPOSANTS_PLACES, "1580 avenue bourgogne app. 3"), "1580 Avenue Bourgogne app. 3, Chambly, QC J3L 2Y7", "l'appartement tapé est gardé");
  assert.equal(formeDepuisGoogle([]), null);
});

test("la ville de Québec reste reconnue par la grille tarifaire", () => {
  const quebec = [
    { longText: "2", types: ["street_number"] }, { longText: "Rue des Jardins", types: ["route"] },
    { longText: "Québec", types: ["locality"] }, { longText: "Québec", shortText: "QC", types: ["administrative_area_level_1"] },
    { longText: "G1R 4S9", types: ["postal_code"] }, { longText: "Canada", shortText: "CA", types: ["country"] },
  ];
  const forme = formeDepuisGoogle(quebec);
  assert.equal(forme, "2 Rue des Jardins, Québec, Capitale-Nationale, QC G1R 4S9");
  assert.equal(matchZone(forme, [{ name: "Québec" }, { name: "Chambly" }])?.name, "Québec");
});

test("hors Canada, le pays est écrit ; un lieu sans numéro garde son nom", () => {
  const usa = [
    { longText: "60", types: ["street_number"] }, { longText: "Smithfield Boulevard", types: ["route"] },
    { longText: "Plattsburgh", types: ["locality"] }, { longText: "New York", shortText: "NY", types: ["administrative_area_level_1"] },
    { longText: "12901", types: ["postal_code"] }, { longText: "États-Unis", shortText: "US", types: ["country"] },
  ];
  assert.equal(formeDepuisGoogle(usa), "60 Smithfield Boulevard, Plattsburgh, NY 12901, États-Unis");
  const lieu = [{ longText: "Brossard", types: ["locality"] }, { longText: "Québec", shortText: "QC", types: ["administrative_area_level_1"] }];
  assert.equal(formeDepuisGoogle(lieu, "", "Station Panama"), "Station Panama, Brossard, QC");
});

test("précision : seul un point à la porte ou un lieu précis lance un guidage direct", () => {
  assert.equal(precisionGoogle({ locationType: "ROOFTOP" }), "porte");
  assert.equal(precisionGoogle({ types: ["street_address"] }), "porte");
  assert.equal(precisionGoogle({ types: ["route"] }), "rue");
  assert.equal(precisionGoogle({ locationType: "GEOMETRIC_CENTER" }), "rue");
  assert.equal(precisionGoogle({ types: ["locality", "political"] }), "approx");
});

test("suggestions : la clé part dans l'en-tête, jamais dans l'adresse, et la recherche vise le Québec", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "cle-de-test";
  try {
    let appel = null;
    const fetchImpl = async (url, options) => {
      appel = { url, options };
      return reponse({ suggestions: [
        { placePrediction: { placeId: "ChIJ_test_1580_bourgogne", text: { text: "1580 Avenue Bourgogne, Chambly, QC, Canada" }, structuredFormat: { mainText: { text: "1580 Avenue Bourgogne" } }, types: ["street_address", "geocode"] } },
        { placePrediction: { placeId: "ChIJ_test_hotel_chambly", text: { text: "Hôtel X, Rue Y, Chambly, QC" }, structuredFormat: { mainText: { text: "Hôtel X" } }, types: ["establishment", "point_of_interest"] } },
      ] })();
    };
    const liste = await suggestions("1580 bourgogne", "session-1", { fetchImpl });
    assert.equal(googleActif(), true);
    assert.equal(appel.url, "https://places.googleapis.com/v1/places:autocomplete");
    assert.equal(appel.options.headers["X-Goog-Api-Key"], "cle-de-test");
    assert.ok(!appel.url.includes("cle-de-test"));
    const corps = JSON.parse(appel.options.body);
    assert.equal(corps.regionCode, "ca");
    assert.equal(corps.sessionToken, "session-1");
    assert.deepEqual(liste.map((s) => s.placeId), ["ChIJ_test_1580_bourgogne", "ChIJ_test_hotel_chambly"]);
    assert.equal(liste[0].nomLieu, null);
    assert.equal(liste[1].nomLieu, "Hôtel X");
  } finally {
    delete process.env.GOOGLE_MAPS_API_KEY;
  }
  assert.equal(googleActif(), false, "sans clé, Google n'est pas utilisé");
});

test("détail d'un lieu choisi : adresse à la forme unique, point exact, champs « Essentials » seulement", async () => {
  let entetes = null;
  const fetchImpl = async (url, options) => {
    entetes = options.headers;
    return reponse({ id: "ChIJ_test_1580_bourgogne", formattedAddress: "1580 Av. Bourgogne, Chambly, QC J3L 2Y7, Canada", addressComponents: COMPOSANTS_PLACES, location: { latitude: 45.4485, longitude: -73.2876 }, types: ["premise", "street_address"] })();
  };
  const lieu = await detailsLieu("ChIJ_test_1580_bourgogne", { fetchImpl });
  assert.equal(lieu.address, "1580 Avenue Bourgogne, Chambly, QC J3L 2Y7");
  assert.equal(lieu.lat, 45.4485);
  assert.equal(lieu.confidence, "porte");
  assert.equal(lieu.placeId, "ChIJ_test_1580_bourgogne");
  assert.ok(!entetes["X-Goog-FieldMask"].includes("displayName"), "le nom du lieu serait facturé au tarif Pro");
});

test("géocodage d'une adresse tapée : introuvable, partiel ou en erreur", async () => {
  const trouve = await geocoderGoogle("1580 avenue bourgogne chambly", { fetchImpl: reponse({ status: "OK", results: [{ address_components: COMPOSANTS_GEOCODING, formatted_address: "x", geometry: { location: { lat: 45.4485, lng: -73.2876 }, location_type: "ROOFTOP" }, place_id: "ChIJ_test_1580_bourgogne", types: ["street_address"] }] }) });
  assert.equal(trouve.forme, "1580 Avenue Bourgogne, Chambly, QC J3L 2Y7");
  assert.equal(trouve.confidence, "porte");
  assert.equal(await geocoderGoogle("zzzz", { fetchImpl: reponse({ status: "ZERO_RESULTS", results: [] }) }), null);
  const partiel = await geocoderGoogle("1580 bourgogne", { fetchImpl: reponse({ status: "OK", results: [{ address_components: COMPOSANTS_GEOCODING, geometry: { location: { lat: 1, lng: 2 }, location_type: "RANGE_INTERPOLATED" }, partial_match: true, types: ["street_address"] }] }) });
  assert.equal(partiel.confidence, "rue", "Google a deviné : pas de guidage direct sur ce point");
  await assert.rejects(geocoderGoogle("x y z", { fetchImpl: reponse({ status: "REQUEST_DENIED", error_message: "clé refusée" }) }), /REQUEST_DENIED/);
});
