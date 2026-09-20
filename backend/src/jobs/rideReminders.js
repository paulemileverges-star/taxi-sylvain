import { prisma } from "../lib/prisma.js";
import { notifyUser } from "../lib/push.js";
import { isDriverOnline } from "../lib/onlineDrivers.js";
import { appelerRappel } from "../lib/twilioVoice.js";
import { buildRideEmail } from "../lib/rideEmails.js";
import { isMailConfigured, sendMail } from "../lib/mailer.js";
import { realEmailOrNull } from "../lib/placeholderEmail.js";
import {
  COURRIEL_AVANT_MINUTES, ESCALADE_AVANT_MINUTES, FENETRE_GRACE_MS,
  rappelEstDu, escaladeNecessaire, messageRappel, messageEscalade, alerteDispatch,
} from "../lib/rappels.js";

// Rappels de course. Tourne chaque minute (voir index.js).
//
// Trois canaux, demandés par le propriétaire le 20 septembre 2026 :
//   - notification push, aux décalages choisis par chacun (User.reminderOffsets) ;
//   - courriel 80 minutes avant, avec le récapitulatif de la course ;
//   - escalade 60 minutes avant si le chauffeur n'est pas en ligne ou n'est pas en route :
//     appel vocal, notification spéciale, son d'urgence et courriel d'urgence, plus une alerte
//     au Dispatch.
//
// Règle de fond : AUCUN canal ne peut bloquer les autres. Chaque envoi a son propre filet et son
// propre délai maximal, et une exécution ne peut pas se chevaucher avec la suivante.
const ACTIVE_STATUSES = ["REQUESTED", "BROADCAST", "ACCEPTED", "EN_ROUTE", "STARTED"];
const MAX_OFFSET_MINUTES = 24 * 60;

let enCours = false;

/** Note qu'un rappel est parti. false = il était déjà parti (personne n'est réveillé deux fois). */
async function marquerEnvoye(rideId, userId, offsetMinutes, canal) {
  try {
    await prisma.sentReminder.create({ data: { rideId, userId, offsetMinutes, canal } });
    return true;
  } catch {
    return false;
  }
}

/** Son et bandeau en direct dans l'application ouverte, en plus de la notification du téléphone. */
function signalerEnDirect(io, userId, evenement, charge) {
  try {
    if (io && userId) io.to(`user:${userId}`).emit(evenement, charge);
  } catch (e) {
    console.error("Rappel en direct non transmis :", e.message);
  }
}

async function courrielDeRappel({ ride, personne, audience, urgent }) {
  const adresse = realEmailOrNull(personne?.email);
  if (!adresse || !isMailConfigured()) return;
  try {
    const { subject, html, text } = buildRideEmail({ ride, audience, cancelled: false });
    const prefixe = urgent ? "URGENT — " : "Rappel — ";
    await sendMail({
      to: adresse,
      toName: personne.name,
      subject: `${prefixe}${subject}`,
      html: `<p style="font:600 15px Segoe UI,Arial,sans-serif;color:#b45309">${urgent ? "Vous n'êtes pas encore en route. Course dans 1 h." : `Rappel : votre course est dans ${COURRIEL_AVANT_MINUTES} minutes.`}</p>${html}`,
      text: `${urgent ? "URGENT : vous n'êtes pas encore en route, course dans 1 h." : `Rappel : course dans ${COURRIEL_AVANT_MINUTES} minutes.`}\n\n${text}`,
    });
  } catch (e) {
    console.error("Courriel de rappel non envoyé :", e.message);
  }
}

export async function sendRideReminders(io = null, maintenant = new Date()) {
  // Verrou : un appel réseau suspendu ne doit pas faire démarrer une deuxième exécution
  // par-dessus la première, qui enverrait tout en double.
  if (enCours) return { ignore: "execution-precedente-en-cours" };
  enCours = true;
  try {
    const rides = await prisma.ride.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        scheduledFor: { gte: new Date(maintenant.getTime() - FENETRE_GRACE_MS), lte: new Date(maintenant.getTime() + MAX_OFFSET_MINUTES * 60 * 1000) },
      },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true, reminderOffsets: true } },
        driver: { select: { id: true, name: true, email: true, phone: true, carModel: true, plate: true, reminderOffsets: true } },
      },
    });

    for (const ride of rides) {
      // 1. Rappels choisis par chacun, par notification et par son.
      for (const [personne, pour] of [[ride.client, "client"], [ride.driver, "chauffeur"]]) {
        if (!personne) continue;
        for (const offsetMinutes of personne.reminderOffsets || []) {
          if (!rappelEstDu({ scheduledFor: ride.scheduledFor, offsetMinutes, now: maintenant })) continue;
          if (!(await marquerEnvoye(ride.id, personne.id, offsetMinutes, "push"))) continue;

          const { titre, texte } = messageRappel({ ride, pour, offsetMinutes });
          await notifyUser(personne.id, { title: titre, body: texte, data: { type: "ride:reminder", rideId: ride.id } });
          signalerEnDirect(io, personne.id, "ride:reminder", { rideId: ride.id, texte, urgent: false });
        }
      }

      // 2. Courriel de rappel, 80 minutes avant, au chauffeur et au client.
      if (rappelEstDu({ scheduledFor: ride.scheduledFor, offsetMinutes: COURRIEL_AVANT_MINUTES, now: maintenant })) {
        for (const [personne, audience] of [[ride.driver, "driver"], [ride.client, "client"]]) {
          if (!personne) continue;
          if (!(await marquerEnvoye(ride.id, personne.id, COURRIEL_AVANT_MINUTES, "courriel"))) continue;
          await courrielDeRappel({ ride, personne, audience, urgent: false });
        }
      }

      // 3. Escalade à 60 minutes : le chauffeur n'est pas en ligne, ou n'est pas encore en route.
      const enLigne = ride.driverId ? isDriverOnline(ride.driverId) : false;
      if (escaladeNecessaire({ ride, enLigne, now: maintenant })) {
        if (await marquerEnvoye(ride.id, ride.driverId, ESCALADE_AVANT_MINUTES, "urgence")) {
          const { titre, texte } = messageEscalade({ ride });
          await notifyUser(ride.driverId, {
            title: titre,
            body: texte,
            data: { type: "ride:reminder:urgent", rideId: ride.id },
            channelId: "urgence",
          });
          signalerEnDirect(io, ride.driverId, "ride:reminder", { rideId: ride.id, texte, urgent: true });
          await courrielDeRappel({ ride, personne: ride.driver, audience: "driver", urgent: true });
          // L'appel vocal reste silencieux tant que Twilio n'a pas de numéro sortant.
          await appelerRappel({ telephone: ride.driver?.phone, ride });
          try {
            io?.to("dispatch").emit("ride:notification", {
              rideId: ride.id,
              status: ride.status,
              text: alerteDispatch({ ride, nomChauffeur: ride.driver?.name, enLigne }),
            });
          } catch (e) {
            console.error("Alerte d'escalade non transmise au Dispatch :", e.message);
          }
        }
      }
    }
    return { courses: rides.length };
  } finally {
    enCours = false;
  }
}

/**
 * Quand l'heure d'une course change, les rappels déjà notés n'ont plus de sens : sans cet
 * effacement, une course déplacée ne redéclenchait plus jamais de rappel.
 */
export async function oublierRappels(rideId) {
  try {
    await prisma.sentReminder.deleteMany({ where: { rideId } });
  } catch (e) {
    console.error("Rappels non réinitialisés :", e.message);
  }
}
