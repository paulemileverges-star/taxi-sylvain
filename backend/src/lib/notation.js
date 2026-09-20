// Courses terminées qui attendent encore la note de la personne (client ou chauffeur).
//
// Demande du propriétaire (correction #12, notation dans les deux sens) : la notation était
// proposée seulement à l'instant où la course se terminait. Application fermée à ce moment-là,
// ou fin de course notée par le chauffeur pendant que le client rangeait son téléphone, et
// l'occasion était perdue. L'application demande donc, à l'ouverture, ce qui reste à noter.
// Règle pure, sans base de données, pour être testée.
export const DELAI_NOTATION_JOURS = 7;

export function coursesANoter(rides, userId, now = new Date()) {
  const limite = new Date(now).getTime() - DELAI_NOTATION_JOURS * 86400000;
  return (rides || [])
    .filter((r) => r?.status === "COMPLETED")
    .filter((r) => r.completedAt && new Date(r.completedAt).getTime() >= limite)
    .filter((r) => r.clientId === userId || r.driverId === userId)
    // Sans autre partie (réservation par téléphone sans compte client), il n'y a personne à noter.
    .filter((r) => (r.clientId === userId ? r.driverId : r.clientId))
    .filter((r) => !(r.ratings || []).some((n) => n.fromUserId === userId))
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .map((r) => ({
      rideId: r.id,
      completedAt: r.completedAt,
      pickupAddress: r.pickupAddress,
      destAddress: r.destAddress,
      autre: (r.clientId === userId ? r.driver : r.client) || null,
    }));
}
