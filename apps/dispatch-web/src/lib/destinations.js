// Libellé court des boutons de destination du catalogue (création et modification d'une course).
// Depuis le 6 octobre 2026, l'aéroport Montréal-Trudeau a deux adresses : les Arrivées (YUL) et le
// stationnement P4 (YULP4).
const COURTS = { YUL: "YUL Arrivées", YULP4: "YUL P4" };

export function libelleCourt(destination) {
  return COURTS[destination?.code] || destination?.code || "";
}

/** La destination du catalogue qui correspond à l'adresse d'une course, ou null. */
export function destinationDeLaCourse(destinations, ride) {
  return (destinations || []).find((d) => d.address === ride?.destAddress) || null;
}
