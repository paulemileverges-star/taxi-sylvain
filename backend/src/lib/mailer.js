// Envoi de courriels transactionnels (confirmation de course, invitation d'agenda).
//
// Aucun compte n'est nécessaire pour faire tourner le serveur : tant qu'aucune clé n'est
// renseignée, les envois sont simplement ignorés et le reste de l'application continue de
// fonctionner normalement. Deux fournisseurs sont reconnus, au choix :
//   - Brevo   : BREVO_API_KEY   (interface en français, forfait gratuit, fait aussi les SMS)
//   - Resend  : RESEND_API_KEY  (plus simple, tout en anglais)
// Dans les deux cas, MAIL_FROM doit utiliser un domaine vérifié chez le fournisseur,
// par exemple : MAIL_FROM="Taxi Sylvain <reservations@votre-domaine.ca>"

const TIMEOUT_MS = 10000;

export function mailProvider() {
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.RESEND_API_KEY) return "resend";
  return null;
}

export function parseFrom(raw = process.env.MAIL_FROM || "") {
  const match = String(raw).match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (match) return { name: match[1].replace(/^"|"$/g, "") || "Taxi Sylvain", email: match[2] };
  const email = String(raw).trim();
  return email ? { name: "Taxi Sylvain", email } : null;
}

export function isMailConfigured() {
  return Boolean(mailProvider() && parseFrom());
}

export function mailStatusLine() {
  const provider = mailProvider();
  const from = parseFrom();
  if (!provider) return "Courriels : non configurés (ni BREVO_API_KEY ni RESEND_API_KEY) — les confirmations ne partent pas.";
  if (!from) return `Courriels : clé ${provider} présente mais MAIL_FROM manquant — les confirmations ne partent pas.`;
  return `Courriels : ${provider}, expéditeur ${from.email}.`;
}

async function post(url, headers, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `${res.status} ${detail.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "délai dépassé" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Envoie un courriel. `calendar` est optionnel : { filename, content, method }.
 * Ne lève jamais d'exception — un fournisseur en panne ne doit pas faire échouer une course.
 */
export async function sendMail({ to, toName, subject, html, text, calendar }) {
  const provider = mailProvider();
  const from = parseFrom();
  if (!provider || !from) return { ok: false, skipped: true, error: "courriels non configurés" };
  if (!to) return { ok: false, skipped: true, error: "destinataire sans courriel" };

  const attachmentBase64 = calendar ? Buffer.from(calendar.content, "utf8").toString("base64") : null;
  const filename = calendar?.filename || "course.ics";

  let result;
  if (provider === "brevo") {
    result = await post(
      "https://api.brevo.com/v3/smtp/email",
      { "api-key": process.env.BREVO_API_KEY, accept: "application/json" },
      {
        sender: { name: from.name, email: from.email },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent: html,
        textContent: text,
        ...(attachmentBase64 ? { attachment: [{ name: filename, content: attachmentBase64 }] } : {}),
      }
    );
  } else {
    const body = { from: `${from.name} <${from.email}>`, to: [to], subject, html, text };
    if (attachmentBase64) {
      body.attachments = [
        {
          filename,
          content: attachmentBase64,
          content_type: `text/calendar; method=${calendar.method || "REQUEST"}; charset=UTF-8`,
        },
      ];
    }
    result = await post("https://api.resend.com/emails", { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, body);
  }

  if (!result.ok) console.error(`Courriel non envoyé à ${to} : ${result.error}`);
  return result;
}
