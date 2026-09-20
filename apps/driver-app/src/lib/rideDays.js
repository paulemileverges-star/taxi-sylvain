// Insère un titre à chaque changement de journée dans une liste de courses.
//
// La liste reçue est déjà dans le bon ordre, et chaque course porte sa journée, calculée par le
// serveur à l'heure du Québec (backend/src/lib/ridesOrder.js). L'application ne calcule donc
// aucune date : elle ne dépend ni du fuseau ni de la langue du téléphone.
//
// Ce fichier n'importe rien : il est chargé tel quel par les tests du serveur.
export function withDayHeaders(rides) {
  const lignes = [];
  let jourEnCours = null;
  for (const ride of rides || []) {
    const cle = ride.dayKey || "";
    if (cle !== jourEnCours) {
      jourEnCours = cle;
      lignes.push({ type: "day", id: `day-${cle || ride.id}`, label: ride.dayLabel || "Date inconnue" });
    }
    lignes.push({ type: "ride", id: ride.id, ride });
  }
  return lignes;
}
