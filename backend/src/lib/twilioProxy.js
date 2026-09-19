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

// Twilio n'accepte que le format international E.164 (+15145551234). Or les numéros sont saisis
// librement dans la console, les imports Excel et les applications : « 514-555-1234 »,
// « (438) 499-1120 », « 1 450 555 1234 », parfois avec un poste. On les convertit ici, au moment
// de l'appel. Renvoie null si le numéro ne peut pas être composé.
export function toE164(raw) {
  if (typeof raw !== "string") return null;
  // Un poste (« poste 12 », « ext. 12 », « x12 », « #12 ») ne se compose pas via Twilio : on l'écarte.
  const main = raw.split(/poste|ext\.?|x|#/i)[0].trim();
  let digits = main.replace(/\D/g, "");

  const international = main.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Numéros nord-américains : l'indicatif régional commence par 2 à 9 (514, 438, 450...).
  if (!international && /^[2-9]\d{9}$/.test(digits)) return `+1${digits}`;
  if (/^1[2-9]\d{9}$/.test(digits)) return `+${digits}`;
  // Autres pays (client de passage, par exemple un numéro français) : préfixe + ou 00 obligatoire.
  if (international && !digits.startsWith("1") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

// Erreur montrée à la personne qui appelle. Elle ne cite jamais le numéro concerné : un chauffeur
// ne doit pas voir le numéro du client, ni l'inverse.
function invalidPhone(qui) {
  const err = new Error(
    `Le numéro de téléphone ${qui} n'est pas valide pour l'appel masqué. Taxi Sylvain doit le corriger dans sa fiche.`
  );
  err.status = 400;
  return err;
}

// Crée (ou réutilise, si déjà ouverte) la session Proxy pour cette course, avec le client et le
// chauffeur comme participants, et renvoie le numéro masqué à composer.
export async function getOrCreateCallSession(ride) {
  // Vérifié avant tout appel à Twilio : un numéro mal saisi donne un message clair au lieu d'une
  // erreur technique de Twilio.
  const clientPhone = toE164(ride.client?.phone);
  if (!clientPhone) throw invalidPhone("du client");
  const driverPhone = toE164(ride.driver?.phone);
  if (!driverPhone) throw invalidPhone("du chauffeur");

  const service = getClient().proxy.v1.services(process.env.TWILIO_PROXY_SERVICE_SID);
  const uniqueName = `ride-${ride.id}`;

  let session;
  try {
    session = await service.sessions(uniqueName).fetch();
  } catch {
    session = await service.sessions.create({ uniqueName, mode: "voice-only" });
  }

  await ensureParticipant(service, session.sid, clientPhone, ride.client.name, "CLIENT");
  const driverParticipant = await ensureParticipant(service, session.sid, driverPhone, ride.driver.name, "DRIVER");

  // Le numéro masqué est commun à toute la session — celui de n'importe quel participant convient.
  return { proxyNumber: driverParticipant.proxyIdentifier, sessionSid: session.sid };
}
