// Génération des invitations d'agenda (fichiers .ics, norme RFC 5545) envoyées en pièce jointe
// des courriels de confirmation. Gmail, Outlook, Apple Calendar et Android reconnaissent ce
// format : le chauffeur voit « Ajouter à l'agenda » et la course s'inscrit dans son calendrier.
//
// Deux règles font tout fonctionner :
// - l'UID est toujours le même pour une course donnée, donc une nouvelle invitation MET À JOUR
//   l'évènement déjà présent au lieu d'en créer un deuxième ;
// - SEQUENCE doit augmenter à chaque envoi, sinon les agendas ignorent la mise à jour.

const PRODID = "-//Taxi Sylvain//Reservations//FR";

const BACKSLASH = String.fromCharCode(92);

export function escapeText(value) {
  return String(value ?? "")
    .split(BACKSLASH)
    .join(BACKSLASH + BACKSLASH)
    .split(";")
    .join(BACKSLASH + ";")
    .split(",")
    .join(BACKSLASH + ",")
    .replace(/\r\n|\r|\n/g, BACKSLASH + "n");
}

// Une ligne d'un fichier .ics ne doit pas dépasser 75 octets : au-delà, on la replie sur la ligne
// suivante précédée d'une espace. On compte en octets (et non en caractères) à cause des accents.
export function fold(line) {
  const out = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    const limit = out.length === 0 ? 75 : 74; // une ligne repliée perd 1 octet pour l'espace initiale
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

function utcStamp(date) {
  return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Durée estimée de la course, pour donner une fin à l'évènement d'agenda : environ deux minutes
// par kilomètre, plus une marge de prise en charge, jamais moins d'une demi-heure.
export function estimatedMinutes(distanceKm) {
  const km = typeof distanceKm === "number" && distanceKm > 0 ? distanceKm : 12;
  return Math.max(30, Math.round(km * 2) + 15);
}

export function rideUid(rideId) {
  return `course-${rideId}@taxi-sylvain`;
}

/**
 * Construit le contenu d'un fichier .ics pour une course.
 * method : "REQUEST" pour une invitation ou sa mise à jour, "CANCEL" pour une annulation.
 */
export function buildRideIcs({ ride, attendee, organizerEmail, method = "REQUEST", sequence = 0, summary, description }) {
  const start = new Date(ride.scheduledFor || ride.createdAt || Date.now());
  const end = new Date(start.getTime() + estimatedMinutes(ride.distanceKm) * 60 * 1000);
  const cancelled = method === "CANCEL";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${rideUid(ride.id)}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(ride.pickupAddress)}`,
    "TRANSP:OPAQUE",
  ];

  if (organizerEmail) lines.push(`ORGANIZER;CN=Taxi Sylvain:mailto:${organizerEmail}`);
  if (attendee?.email) {
    lines.push(
      `ATTENDEE;CN=${escapeText(attendee.name || attendee.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email}`
    );
  }

  // Rappel dans l'agenda une heure avant la prise en charge, en plus des rappels de l'application.
  if (!cancelled) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Course Taxi Sylvain dans 1 h", "TRIGGER:-PT1H", "END:VALARM");
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
