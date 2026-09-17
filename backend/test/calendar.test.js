import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRideIcs, escapeText, estimatedMinutes, fold, rideUid } from "../src/lib/calendar.js";

const RIDE = {
  id: "ride123",
  scheduledFor: "2026-09-20T13:30:00.000Z",
  distanceKm: 32.4,
  pickupAddress: "12 Rue Bourgogne, Chambly, QC",
  destAddress: "Aéroport Montréal-Trudeau",
};

function ics(extra = {}) {
  return buildRideIcs({
    ride: RIDE,
    attendee: { name: "Mamadou Diallo", email: "mamadou@example.com" },
    organizerEmail: "reservations@taxi-sylvain.ca",
    summary: "Course Taxi Sylvain",
    description: "Départ : 12 Rue Bourgogne",
    ...extra,
  });
}

// Défait le repliement des lignes long format pour retrouver les valeurs telles qu'un agenda les lit.
function unfold(text) {
  return text.replace(/\r\n /g, "");
}

function value(text, property) {
  const line = unfold(text)
    .split("\r\n")
    .find((l) => l.startsWith(`${property}:`) || l.startsWith(`${property};`));
  return line ? line.slice(line.indexOf(":") + 1) : null;
}

test("l'identifiant d'une course ne change jamais, pour que l'agenda mette à jour au lieu de dupliquer", () => {
  assert.equal(rideUid("ride123"), "course-ride123@taxi-sylvain");
  assert.equal(value(ics(), "UID"), "course-ride123@taxi-sylvain");
  assert.equal(value(ics({ sequence: 7 }), "UID"), "course-ride123@taxi-sylvain");
});

test("le numéro de séquence est repris tel quel", () => {
  assert.equal(value(ics({ sequence: 0 }), "SEQUENCE"), "0");
  assert.equal(value(ics({ sequence: 5 }), "SEQUENCE"), "5");
});

test("une annulation retire l'évènement et son rappel", () => {
  const cancelled = ics({ method: "CANCEL", sequence: 3 });
  assert.equal(value(cancelled, "METHOD"), "CANCEL");
  assert.equal(value(cancelled, "STATUS"), "CANCELLED");
  assert.ok(!cancelled.includes("BEGIN:VALARM"));
});

test("une invitation normale est confirmée et rappelle une heure avant", () => {
  const invite = ics();
  assert.equal(value(invite, "METHOD"), "REQUEST");
  assert.equal(value(invite, "STATUS"), "CONFIRMED");
  assert.ok(invite.includes("TRIGGER:-PT1H"));
});

test("l'heure de fin découle de la distance", () => {
  assert.equal(value(ics(), "DTSTART"), "20260920T133000Z");
  // 32,4 km : environ 2 min/km plus 15 min de marge, soit 80 minutes.
  assert.equal(estimatedMinutes(32.4), 80);
  assert.equal(value(ics(), "DTEND"), "20260920T145000Z");
});

test("une course très courte ou sans distance garde une durée minimale d'une demi-heure", () => {
  assert.equal(estimatedMinutes(1), 30);
  assert.equal(estimatedMinutes(null), 39);
  assert.equal(estimatedMinutes(undefined), 39);
});

test("les virgules et points-virgules des adresses sont échappés, sinon l'agenda coupe la valeur", () => {
  const backslash = String.fromCharCode(92);
  assert.equal(escapeText("12 Rue Bourgogne, Chambly, QC"), `12 Rue Bourgogne${backslash}, Chambly${backslash}, QC`);
  assert.equal(escapeText("a;b"), `a${backslash};b`);
  assert.equal(escapeText("ligne1\nligne2"), `ligne1${backslash}nligne2`);
  assert.equal(escapeText(backslash), backslash + backslash);
  assert.equal(escapeText(null), "");
});

test("aucune ligne ne dépasse 75 octets, accents compris", () => {
  const long = ics({
    description: "Départ : 1234 Boulevard de l'Assomption, Montréal, QC H1T 2N1 — Destination : Aéroport Montréal-Trudeau, 975 Boulevard Roméo-Vachon Nord, Dorval",
  });
  for (const line of long.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `ligne trop longue : ${line}`);
  }
});

test("le repliement est réversible : la valeur d'origine est retrouvée intacte", () => {
  const original = "DESCRIPTION:" + "Montréal-Trudeau ".repeat(12);
  assert.equal(unfold(fold(original)), original);
});

test("le fichier est un calendrier complet et bien fermé", () => {
  const invite = ics();
  assert.ok(invite.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(invite.endsWith("END:VCALENDAR\r\n"));
  assert.equal((invite.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.equal((invite.match(/END:VEVENT/g) || []).length, 1);
  assert.ok(invite.includes("ATTENDEE;CN=Mamadou Diallo;"));
  assert.ok(invite.includes("mailto:mamadou@example.com"));
  assert.ok(invite.includes("ORGANIZER;CN=Taxi Sylvain:mailto:reservations@taxi-sylvain.ca"));
});

test("une course sans heure programmée reste plaçable dans l'agenda", () => {
  const immediate = buildRideIcs({
    ride: { ...RIDE, scheduledFor: null, createdAt: "2026-09-18T11:00:00.000Z" },
    summary: "Course",
    description: "",
  });
  assert.equal(value(immediate, "DTSTART"), "20260918T110000Z");
});
