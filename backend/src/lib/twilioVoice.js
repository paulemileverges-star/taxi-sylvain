// Appel vocal de rappel vers un chauffeur qui n'est pas encore en route, une heure avant sa
// course. C'est la partie « Voice » de Twilio, différente de l'appel masqué (Proxy) déjà codé :
// ici Taxi Sylvain appelle, et une voix lit un message.
//
// Tant que les identifiants Twilio ne sont pas renseignés, tout est INACTIF et silencieux :
// aucune erreur, aucun blocage des trois autres canaux de rappel.
import { toE164 } from "./twilioProxy.js";

const API = "https://api.twilio.com/2010-04-01";

export function isVoiceConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_CALLER_NUMBER);
}

export function voiceStatusLine() {
  if (isVoiceConfigured()) return `Appel vocal de rappel : actif (numéro ${process.env.TWILIO_CALLER_NUMBER}).`;
  return "Appel vocal de rappel : inactif (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_CALLER_NUMBER manquants).";
}

/** Le message lu au téléphone. Court, clair, répété une fois. */
export function twimlRappel({ pickupAddress, destAddress }) {
  const texte = `Bonjour, ici Taxi Sylvain. Rappel : vous avez une course dans une heure, de ${pickupAddress} vers ${destAddress}. ` +
    `Merci de vous mettre en route ou de nous rappeler.`;
  const echappe = String(texte).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Chantal" language="fr-CA">${echappe}</Say><Pause length="1"/><Say voice="Polly.Chantal" language="fr-CA">${echappe}</Say></Response>`;
}

/**
 * Déclenche l'appel. Ne lève jamais : un échec d'appel ne doit pas empêcher la notification,
 * le son et le courriel de partir.
 */
export async function appelerRappel({ telephone, ride }) {
  if (!isVoiceConfigured()) return { skipped: true, raison: "twilio-absent" };
  let destination;
  try {
    destination = toE164(telephone);
  } catch {
    return { skipped: true, raison: "numero-invalide" };
  }
  if (!destination) return { skipped: true, raison: "numero-invalide" };

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const corps = new URLSearchParams({
    To: destination,
    From: process.env.TWILIO_CALLER_NUMBER,
    Twiml: twimlRappel(ride),
  });

  try {
    const res = await fetch(`${API}/Accounts/${sid}/Calls.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: corps,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Appel de rappel refusé par Twilio :", res.status, detail.slice(0, 200));
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    console.error("Appel de rappel impossible :", err.message);
    return { ok: false, erreur: err.message };
  }
}
