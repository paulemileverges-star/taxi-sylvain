import Twilio from "twilio";

// Masquage d'appel vocal (besoin #2) via Twilio Proxy : chaque course a une "session" Proxy
// identifiée par son id. Le client et le chauffeur y sont ajoutés comme participants avec leur
// vrai numéro (E.164, ex. +15145551234) ; Twilio leur attribue à tous les deux un même numéro
// masqué pour cette session. Quand l'un compose ce numéro depuis son téléphone, Twilio reconnaît
// l'appelant à son vrai numéro et relie l'appel à l'autre participant — sans jamais révéler le
// vrai numéro de personne à l'autre partie. Doc : https://www.twilio.com/docs/proxy

export function isConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PROXY_SERVICE_SID);
}

let client;
function getClient() {
  if (!client) client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

async function ensureParticipant(service, sessionSid, phone, friendlyName, role) {
  const participants = await service.sessions(sessionSid).participants.list();
  const existing = participants.find((p) => p.identifier === phone);
  if (existing) return existing;
  return service.sessions(sessionSid).participants.create({
    identifier: phone,
    friendlyName,
    attributes: JSON.stringify({ role }),
  });
}

// Crée (ou réutilise, si déjà ouverte) la session Proxy pour cette course, avec le client et le
// chauffeur comme participants, et renvoie le numéro masqué à composer.
export async function getOrCreateCallSession(ride) {
  const service = getClient().proxy.v1.services(process.env.TWILIO_PROXY_SERVICE_SID);
  const uniqueName = `ride-${ride.id}`;

  let session;
  try {
    session = await service.sessions(uniqueName).fetch();
  } catch {
    session = await service.sessions.create({ uniqueName, mode: "voice-only" });
  }

  await ensureParticipant(service, session.sid, ride.client.phone, ride.client.name, "CLIENT");
  const driverParticipant = await ensureParticipant(service, session.sid, ride.driver.phone, ride.driver.name, "DRIVER");

  // Le numéro masqué est commun à toute la session — celui de n'importe quel participant convient.
  return { proxyNumber: driverParticipant.proxyIdentifier, sessionSid: session.sid };
}
