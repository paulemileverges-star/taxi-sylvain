// Courriels automatiques de course : confirmation, mise à jour et annulation, avec l'invitation
// d'agenda en pièce jointe. Le chauffeur reçoit la course directement dans son calendrier, le
// client reçoit son récapitulatif.
//
// Règle de base : un envoi de courriel ne doit JAMAIS faire échouer une action de l'application.
// Toutes les fonctions ci-dessous attrapent leurs erreurs et se contentent de les journaliser.

import { prisma } from "./prisma.js";
import { isMailConfigured, parseFrom, sendMail } from "./mailer.js";
import { buildRideIcs } from "./calendar.js";
import { realEmailOrNull } from "./placeholderEmail.js";

const TZ = "America/Toronto";
const DRIVER_APP_URL = process.env.DRIVER_APP_URL || "https://taxi-sylvain-driver.vercel.app";
const CLIENT_APP_URL = process.env.CLIENT_APP_URL || "https://taxi-sylvain-client.vercel.app";

const RIDE_INCLUDE = {
  client: { select: { id: true, name: true, email: true, phone: true } },
  driver: { select: { id: true, name: true, email: true, carModel: true, plate: true } },
};

export function formatWhen(date) {
  if (!date) return "dès que possible";
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "full", timeStyle: "short", timeZone: TZ }).format(new Date(date));
}

function formatShort(date) {
  if (!date) return "dès que possible";
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "short", timeStyle: "short", timeZone: TZ }).format(new Date(date));
}

function money(fare) {
  return typeof fare === "number" && fare > 0 ? `${fare.toFixed(2)} $` : "à confirmer par Taxi Sylvain";
}

/** Lignes du récapitulatif, communes au courriel et à la description de l'évènement d'agenda. */
export function rideFields(ride, audience) {
  const fields = [
    ["Date et heure", formatWhen(ride.scheduledFor)],
    ["Adresse de départ", ride.pickupAddress],
    ["Destination", ride.destAddress],
  ];
  if (typeof ride.distanceKm === "number") fields.push(["Distance", `${ride.distanceKm.toFixed(1)} km`]);
  if (ride.flightNumber) fields.push(["Numéro de vol", ride.flightNumber]);
  fields.push(["Montant", money(ride.fare)]);

  if (audience === "driver" && ride.client?.name) {
    fields.push(["Client", ride.client.name]);
  }
  if (audience === "client" && ride.driver?.name) {
    const vehicle = [ride.driver.carModel, ride.driver.plate].filter(Boolean).join(" · ");
    fields.push(["Chauffeur", vehicle ? `${ride.driver.name} · ${vehicle}` : ride.driver.name]);
  }
  return fields;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Compose le courriel complet pour un destinataire. Fonction pure : testable sans réseau. */
export function buildRideEmail({ ride, audience, cancelled = false }) {
  const fields = rideFields(ride, audience);
  const trajet = `${ride.pickupAddress} vers ${ride.destAddress}`;
  const subject = cancelled
    ? `Course annulée · ${formatShort(ride.scheduledFor)} · ${trajet}`
    : `Course confirmée · ${formatShort(ride.scheduledFor)} · ${trajet}`;

  const intro = cancelled
    ? audience === "driver"
      ? "Cette course ne vous est plus affectée. Elle a été retirée de votre agenda."
      : "Votre course a été annulée. Elle a été retirée de votre agenda."
    : audience === "driver"
      ? "Cette course vous est affectée. L'invitation jointe l'ajoute à votre agenda."
      : "Votre course est confirmée. L'invitation jointe l'ajoute à votre agenda.";

  const appUrl = audience === "driver" ? DRIVER_APP_URL : CLIENT_APP_URL;
  const rows = fields
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#16233a;color:#f5a623;padding:16px 20px;border-radius:12px 12px 0 0;font-size:18px;font-weight:700">Taxi Sylvain</div>
  <div style="background:#ffffff;padding:20px;border-radius:0 0 12px 12px">
    <p style="margin:0 0 16px;color:#111827;font-size:15px">${escapeHtml(intro)}</p>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
    <p style="margin:20px 0 0"><a href="${appUrl}" style="background:#f5a623;color:#1a1200;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:14px">Ouvrir l'application</a></p>
    <p style="margin:18px 0 0;color:#6b7280;font-size:12px">Courriel automatique de Taxi Sylvain. Pour toute question, répondez à ce message.</p>
  </div>
</div></body></html>`;

  const text = [intro, "", ...fields.map(([label, value]) => `${label} : ${value}`), "", appUrl].join("\n");
  const summary =
    audience === "driver"
      ? `Course Taxi Sylvain · ${ride.client?.name || "client"}`
      : `Taxi Sylvain · ${ride.driver?.name || "chauffeur à confirmer"}`;
  const description = fields.map(([label, value]) => `${label} : ${value}`).join("\n");

  return { subject, html, text, summary, description };
}

// Exportée pour être testable : elle porte la règle « jamais de courriel fictif ».
export async function deliver({ ride, person, audience, cancelled, sequence }) {
  const email = realEmailOrNull(person?.email);
  if (!email) return { ok: false, skipped: true };

  const { subject, html, text, summary, description } = buildRideEmail({ ride, audience, cancelled });
  const method = cancelled ? "CANCEL" : "REQUEST";
  const ics = buildRideIcs({
    ride,
    attendee: { name: person.name, email },
    organizerEmail: parseFrom()?.email,
    method,
    sequence,
    summary,
    description,
  });

  return sendMail({
    to: email,
    toName: person.name,
    subject,
    html,
    text,
    calendar: { filename: "course-taxi-sylvain.ics", content: ics, method },
  });
}

/**
 * Course confirmée, réaffectée ou modifiée : (ré)envoie l'invitation au chauffeur et le
 * récapitulatif au client. Le numéro de séquence augmente à chaque envoi pour que les agendas
 * mettent à jour l'évènement existant au lieu d'en créer un nouveau.
 */
export async function sendRideConfirmation(rideId) {
  if (!isMailConfigured()) return { skipped: true };
  try {
    const ride = await prisma.ride.update({
      where: { id: rideId },
      data: { calendarSeq: { increment: 1 } },
      include: RIDE_INCLUDE,
    });
    const sequence = ride.calendarSeq;
    const results = await Promise.all([
      ride.driver ? deliver({ ride, person: ride.driver, audience: "driver", cancelled: false, sequence }) : null,
      ride.client ? deliver({ ride, person: ride.client, audience: "client", cancelled: false, sequence }) : null,
    ]);
    return { sent: results.filter((r) => r?.ok).length };
  } catch (err) {
    console.error("Courriel de confirmation non envoyé:", err.message);
    return { error: err.message };
  }
}

/**
 * Course annulée, supprimée, ou chauffeur retiré : envoie une annulation d'agenda aux personnes
 * concernées. La course peut déjà avoir disparu de la base, donc on travaille sur l'objet reçu.
 */
export async function sendRideCancellation(ride, people) {
  if (!isMailConfigured()) return { skipped: true };
  try {
    const sequence = (ride.calendarSeq || 0) + 1;
    const results = await Promise.all(
      (people || [])
        .filter(Boolean)
        .map((entry) => deliver({ ride, person: entry.person, audience: entry.audience, cancelled: true, sequence }))
    );
    return { sent: results.filter((r) => r?.ok).length };
  } catch (err) {
    console.error("Courriel d'annulation non envoyé:", err.message);
    return { error: err.message };
  }
}

export async function loadRideForEmail(rideId) {
  return prisma.ride.findUnique({ where: { id: rideId }, include: RIDE_INCLUDE });
}
